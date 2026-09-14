import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../../../context/AppContext";
import { deriveLevel, getLatestSeanceOccurrence } from "../supervisorHelpers";
import {
  computeAttendanceHistorySummary,
  isSupabaseEntityId,
} from "../supervisorAttendanceHelpers";
import { getSupervisorActiveSeances, getSeanceMembers } from "../../../lib/membersApi";
import {
  buildSeanceAttendanceHistory,
  getSeancePresenceForDate,
  getPresenceReminderForOccurrence,
} from "../../../lib/presenceApi";
import { getMemberProgressionSummary, countMembersWithNewProgress } from "../../../lib/progressApi";
import { getSeenAt, setSeenAt } from "../../../data/seenAt";

/** Message UI mode dégradé (mock après échec Supabase réel). */
export const SUPERVISOR_FETCH_DEGRADED_MESSAGE =
  "تعذر تحميل بيانات المجموعة، يتم عرض بيانات محلية";

function buildScheduleLabel(seance) {
  const heureDebut = seance.heure_debut ? seance.heure_debut.slice(0, 5) : "";
  const heureFin = seance.heure_fin ? seance.heure_fin.slice(0, 5) : "";
  const heures =
    heureDebut && heureFin ? `${heureDebut} - ${heureFin}` : heureDebut || heureFin;
  return [seance.jour, heures].filter(Boolean).join(" ");
}

function weeklyPresenceToMemberStatus(presence, occurrence = {}) {
  if (presence === "present") return "present";
  if (presence === "absent") return "absent";
  if (occurrence.withinMarkingWindow) return "absent";
  return "none";
}

function isWeeklyPresenceMarked(weeklyPresenceByMember) {
  return Object.values(weeklyPresenceByMember || {}).some(
    (s) => s === "present" || s === "absent"
  );
}

function buildGroupFromSeance(seance, seanceMembers = []) {
  return {
    id: seance.id,
    name: seance.nom,
    seasonId: seance.saison_id,
    saisonDateDebut:
      seance.saisons?.date_debut || seance.saisons?.start_date || null,
    createdAt: seance.created_at || null,
    supervisorId: seance.superviseur_id,
    memberIds: seanceMembers.map((m) => m.userId),
    jour: seance.jour,
    heureDebut: seance.heure_debut || null,
    schedule: buildScheduleLabel(seance),
  };
}

function mapSeanceMembersToRows(seanceMembers, group) {
  return seanceMembers.map((m) => ({
    user: {
      id: m.userId,
      firstName: m.prenom,
      lastName: m.nom,
      email: m.email,
      avatarUrl: m.avatarUrl || null,
      phone: m.telephone,
      school: m.ecole,
      level: m.niveau,
      hifzAmount: m.quantiteHifz,
      birthDate: m.dateNaissance,
      gender: m.genre,
    },
    group,
    // Rempli ensuite par fetchLatestProgressByMemberId (N × limit 1).
    prog: null,
    registrationStatus: m.statutInscription,
    registrationDate: m.dateInscription,
  }));
}

/**
 * Dernière ligne progression par membre (limit 1), en parallèle.
 * Un échec isolé laisse ce membre sans position ; les autres restent affichés.
 */
async function fetchLatestProgressByMemberId(membreIds) {
  const ids = (membreIds || []).filter(Boolean);
  const pairs = await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await getMemberProgressionSummary(id);
        if (!res.ok) {
          console.warn(
            "useSupervisorMembers: échec lecture progression —",
            id,
            res.error
          );
          return [id, null];
        }
        if (!res.hasData || !res.metrics) {
          return [id, null];
        }
        return [id, { metrics: res.metrics, entry: res.entry || null }];
      } catch (e) {
        console.warn(
          "useSupervisorMembers: échec lecture progression —",
          id,
          e?.message || e
        );
        return [id, null];
      }
    })
  );
  return Object.fromEntries(pairs);
}

function applyProgressToMembers(members, byId) {
  return (members || []).map((m) => ({
    ...m,
    prog: byId[m.user?.id] || null,
  }));
}

function latestProgressDateMs(member) {
  const iso = member?.prog?.entry?.date;
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function latestProgressRowId(member) {
  return String(member?.prog?.entry?.id || "");
}

/** Copie triée : dernière saisie (`date`) d'abord ; sans saisie en fin. */
function sortMembersByLatestProgress(members) {
  return [...(members || [])].sort((a, b) => {
    const aMs = latestProgressDateMs(a);
    const bMs = latestProgressDateMs(b);
    if (aMs != null && bMs == null) return -1;
    if (aMs == null && bMs != null) return 1;
    if (aMs == null && bMs == null) return 0;
    if (bMs !== aMs) return bMs - aMs;
    return latestProgressRowId(b).localeCompare(latestProgressRowId(a));
  });
}

function memberGlobalPct(member) {
  const raw = member?.prog?.metrics?.globalPct;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

function inscriptionDateIso(row) {
  return row?.dateInscription || row?.registrationDate || null;
}

/** Membres dont dateInscription est strictement postérieure à seenAt. Sans date = ignoré. */
function countNewMembersSince(memberRows, seenAtIso) {
  const seenMs = Date.parse(seenAtIso);
  if (!Number.isFinite(seenMs)) return 0;
  return (memberRows || []).reduce((n, row) => {
    const iso = inscriptionDateIso(row);
    if (!iso) return n;
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || t <= seenMs) return n;
    return n + 1;
  }, 0);
}

async function resolveNewMembersCount(userId, seanceId, memberRows) {
  if (!userId || !seanceId) return 0;
  const existing = await getSeenAt("members", userId, seanceId);
  if (!existing) {
    await setSeenAt("members", userId, seanceId, new Date().toISOString());
    return 0;
  }
  return countNewMembersSince(memberRows, existing);
}

async function resolveNewProgressCount(userId, seanceId) {
  if (!userId || !seanceId) return 0;
  const existing = await getSeenAt("progress", userId, seanceId);
  if (!existing) {
    await setSeenAt("progress", userId, seanceId, new Date().toISOString());
    return 0;
  }
  const res = await countMembersWithNewProgress(seanceId, existing);
  return res.ok ? res.count || 0 : 0;
}

async function resolvePresenceDotSeen(userId, seanceId, sessionDate) {
  if (!userId || !seanceId || !sessionDate) return false;
  const existing = await getSeenAt("presence", userId, seanceId);
  return existing === String(sessionDate);
}

/**
 * Séance active + membres du superviseur connecté.
 *
 * @param {string|null} selectedGroupId — id du groupe/séance sélectionné (Dashboard)
 * @returns activeGroup dérivé de myGroups + selectedGroupId
 *
 * États exposés :
 * - loading : premier fetch Supabase en cours (pas de flash mock)
 * - fetchError : échec réel Supabase → repli mock signalé côté UI
 * - dataSource : 'supabase' | 'mock'
 */
export function useSupervisorMembers(selectedGroupId = null) {
  const {
    currentUser,
    getSupervisorGroups,
    getUserById,
    getMemberProgress,
    supabaseSession,
  } = useApp();

  const myGroupsMock = getSupervisorGroups(currentUser?.id);

  const mockMembers = useMemo(() => {
    const list = [];
    const seen = new Set();
    myGroupsMock.forEach((g) => {
      g.memberIds.forEach((mid) => {
        if (seen.has(mid)) return;
        seen.add(mid);
        const user = getUserById(mid);
        const prog = getMemberProgress(mid, g.seasonId);
        if (user) list.push({ user, group: g, prog });
      });
    });
    return list;
  }, [myGroupsMock, getUserById, getMemberProgress]);

  const supervisorAuthId = supabaseSession?.user?.id || null;
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  const [fetchState, setFetchState] = useState({
    loading: false,
    loaded: false,
    error: null,
  });
  const [supabaseData, setSupabaseData] = useState({
    myGroups: [],
    members: [],
    weeklyPresenceByMember: {},
    occurrenceMeta: null,
    globalAttendancePct: null,
    showPresenceReminder: false,
    progressLoaded: true,
    newMembersCount: 0,
    newProgressCount: 0,
    presenceDotSeen: false,
  });

  useEffect(() => {
    if (!supervisorAuthId) {
      setFetchState({ loading: false, loaded: false, error: null });
      setSupabaseData({
        myGroups: [],
        members: [],
        weeklyPresenceByMember: {},
        occurrenceMeta: null,
        globalAttendancePct: null,
        showPresenceReminder: false,
        progressLoaded: true,
        newMembersCount: 0,
        newProgressCount: 0,
        presenceDotSeen: false,
      });
      return;
    }

    let cancelled = false;
    setFetchState((prev) => ({
      loading: true,
      loaded: prev.loaded,
      error: null,
    }));

    (async () => {
      try {
        const seancesRes = await getSupervisorActiveSeances(supervisorAuthId);
        if (cancelled) return;

        if (!seancesRes.ok) {
          console.warn(
            "useSupervisorMembers: échec lecture séance Supabase —",
            seancesRes.error
          );
          setSupabaseData({
            myGroups: [],
            members: [],
            weeklyPresenceByMember: {},
            occurrenceMeta: null,
            globalAttendancePct: null,
            showPresenceReminder: false,
            progressLoaded: true,
            newMembersCount: 0,
            newProgressCount: 0,
            presenceDotSeen: false,
          });
          setFetchState({
            loading: false,
            loaded: false,
            error: seancesRes.error || SUPERVISOR_FETCH_DEGRADED_MESSAGE,
          });
          return;
        }

        const seances = seancesRes.seances || [];
        if (seances.length === 0) {
          setSupabaseData({
            myGroups: [],
            members: [],
            weeklyPresenceByMember: {},
            occurrenceMeta: null,
            globalAttendancePct: null,
            showPresenceReminder: false,
            progressLoaded: true,
            newMembersCount: 0,
            newProgressCount: 0,
            presenceDotSeen: false,
          });
          setFetchState({ loading: false, loaded: true, error: null });
          return;
        }

        const seance =
          seances.find((s) => s.id === selectedGroupId) || seances[0];

        const membersRes = await getSeanceMembers(seance.id);
        if (cancelled) return;

        if (!membersRes.ok) {
          console.warn(
            "useSupervisorMembers: échec lecture membres Supabase —",
            membersRes.error
          );
          setSupabaseData({
            myGroups: [],
            members: [],
            weeklyPresenceByMember: {},
            occurrenceMeta: null,
            globalAttendancePct: null,
            showPresenceReminder: false,
            progressLoaded: true,
            newMembersCount: 0,
            newProgressCount: 0,
            presenceDotSeen: false,
          });
          setFetchState({
            loading: false,
            loaded: false,
            error: membersRes.error || SUPERVISOR_FETCH_DEGRADED_MESSAGE,
          });
          return;
        }

        const seanceMembers = membersRes.members;
        const group = buildGroupFromSeance(seance, seanceMembers);
        const myGroups = seances.map((s) =>
          buildGroupFromSeance(s, s.id === seance.id ? seanceMembers : [])
        );
        const members = mapSeanceMembersToRows(seanceMembers, group);
        const newMembersCount = await resolveNewMembersCount(
          supervisorAuthId,
          seance.id,
          seanceMembers
        );
        const newProgressCount = await resolveNewProgressCount(
          supervisorAuthId,
          seance.id
        );
        if (cancelled) return;

        let weeklyPresenceByMember = {};
        let occurrenceMeta = null;
        const occurrence = getLatestSeanceOccurrence(
          seance.jour,
          new Date(),
          seance.heure_debut || null
        );
        const presenceDotSeen = await resolvePresenceDotSeen(
          supervisorAuthId,
          seance.id,
          occurrence.sessionDate
        );
        if (cancelled) return;
        if (occurrence.sessionDate && occurrence.sessionStarted) {
          occurrenceMeta = occurrence;
          const presRes = await getSeancePresenceForDate(
            seance.id,
            occurrence.sessionDate,
            group.memberIds
          );
          if (cancelled) return;
          if (presRes.ok) {
            weeklyPresenceByMember = presRes.byMemberId || {};
          } else {
            console.warn(
              "useSupervisorMembers: échec lecture présence hebdo —",
              presRes.error
            );
          }
        }

        let showPresenceReminder = false;
        if (occurrence.withinMarkingWindow && occurrence.sessionDate) {
          const isMarked = isWeeklyPresenceMarked(weeklyPresenceByMember);
          if (!isMarked) {
            const rappelRes = await getPresenceReminderForOccurrence(
              seance.id,
              occurrence.sessionDate
            );
            if (cancelled) return;
            if (rappelRes.ok && (rappelRes.nbRappels ?? 0) > 0) {
              showPresenceReminder = true;
            }
          }
        }

        let globalAttendancePct = null;
        const memberIds = group.memberIds;
        const canLoadGlobalHistory =
          seance.id &&
          seance.jour &&
          memberIds.length > 0 &&
          group.saisonDateDebut &&
          isSupabaseEntityId(seance.id) &&
          memberIds.every((id) => isSupabaseEntityId(id));

        if (canLoadGlobalHistory) {
          const historyRes = await buildSeanceAttendanceHistory(
            seance.id,
            seance.jour,
            seance.heure_debut || null,
            group.saisonDateDebut,
            memberIds
          );
          if (cancelled) return;
          if (historyRes.ok) {
            const summary = computeAttendanceHistorySummary(
              historyRes.rows,
              memberIds.length
            );
            if (summary.attendancePct != null) {
              globalAttendancePct = summary.attendancePct;
            }
          } else {
            console.warn(
              "useSupervisorMembers: échec historique global —",
              historyRes.error
            );
          }
        }

        setSupabaseData({
          myGroups,
          members,
          weeklyPresenceByMember,
          occurrenceMeta,
          globalAttendancePct,
          showPresenceReminder,
          progressLoaded: memberIds.length === 0,
          newMembersCount,
          newProgressCount,
          presenceDotSeen,
        });
        setFetchState({ loading: false, loaded: true, error: null });

        // Positions après le premier rendu : N × getMemberProgressionSummary en parallèle.
        if (memberIds.length > 0) {
          const byId = await fetchLatestProgressByMemberId(memberIds);
          if (cancelled) return;
          setSupabaseData((prev) => ({
            ...prev,
            members: applyProgressToMembers(prev.members, byId),
            progressLoaded: true,
          }));
        }
      } catch (e) {
        console.warn(
          "useSupervisorMembers: erreur réseau/timeout, repli sur le mock —",
          e?.message || e
        );
        if (!cancelled) {
          setSupabaseData({
            myGroups: [],
            members: [],
            weeklyPresenceByMember: {},
            occurrenceMeta: null,
            globalAttendancePct: null,
            showPresenceReminder: false,
            progressLoaded: true,
            newMembersCount: 0,
            newProgressCount: 0,
            presenceDotSeen: false,
          });
          setFetchState({
            loading: false,
            loaded: false,
            error: e?.message || SUPERVISOR_FETCH_DEGRADED_MESSAGE,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supervisorAuthId, selectedGroupId, refreshKey]);

  const loading = !!supervisorAuthId && fetchState.loading && !fetchState.loaded;
  const fetchError =
    supervisorAuthId && !fetchState.loading && fetchState.error
      ? fetchState.error
      : null;
  const usingSupabase =
    !!supervisorAuthId && fetchState.loaded && !fetchState.error;

  // Pendant le chargement Supabase : pas de mock ni EmptyState trompeur.
  const myGroups = loading
    ? []
    : usingSupabase
    ? supabaseData.myGroups
    : myGroupsMock;
  const members = loading
    ? []
    : usingSupabase
    ? supabaseData.members
    : mockMembers;

  const membersByLatestProgress = useMemo(
    () => sortMembersByLatestProgress(members),
    [members]
  );

  const activeGroup =
    myGroups.find((g) => g.id === selectedGroupId) || myGroups[0] || null;

  const weeklyPresenceByMember = usingSupabase ? supabaseData.weeklyPresenceByMember : {};
  const occurrenceMeta = usingSupabase ? supabaseData.occurrenceMeta : null;

  const isMarkingWindowOpen =
    usingSupabase && occurrenceMeta?.withinMarkingWindow === true;

  const isPresenceMarked = isWeeklyPresenceMarked(weeklyPresenceByMember);

  const showUnmarkedPresenceDot =
    isMarkingWindowOpen && members.length > 0 && !isPresenceMarked;

  const showPresenceReminder =
    usingSupabase && supabaseData.showPresenceReminder === true;

  const membersWithStatus = useMemo(
    () =>
      members.map((m) => {
        const pct = memberGlobalPct(m);
        const status = usingSupabase
          ? weeklyPresenceToMemberStatus(
              weeklyPresenceByMember[m.user.id],
              occurrenceMeta || {}
            )
          : "none";
        return {
          ...m,
          pct,
          level: pct != null ? deriveLevel(pct) : null,
          status,
        };
      }),
    [members, usingSupabase, weeklyPresenceByMember, occurrenceMeta]
  );

  const presentCount = membersWithStatus.filter((m) => m.status === "present").length;

  const weeklyFallbackPct =
    usingSupabase && occurrenceMeta?.sessionStarted && members.length > 0
      ? Math.round((presentCount / members.length) * 100)
      : usingSupabase
      ? 0
      : members.length === 0
      ? 0
      : Math.round((presentCount / members.length) * 100);

  const attendancePct =
    usingSupabase && supabaseData.globalAttendancePct != null
      ? supabaseData.globalAttendancePct
      : weeklyFallbackPct;

  // Moyenne des globalPct des membres ayant une saisie — pas hifzPages, pas les sans position.
  const avgProgress = useMemo(() => {
    const pcts = membersWithStatus
      .map((m) => m.pct)
      .filter((p) => p != null && Number.isFinite(p));
    if (pcts.length === 0) return null;
    return Math.round(pcts.reduce((sum, p) => sum + p, 0) / pcts.length);
  }, [membersWithStatus]);

  const progressLoading = usingSupabase && supabaseData.progressLoaded === false;

  const newMembersCount = usingSupabase ? supabaseData.newMembersCount || 0 : 0;
  const newProgressCount = usingSupabase ? supabaseData.newProgressCount || 0 : 0;
  const presenceDotSeen = usingSupabase && supabaseData.presenceDotSeen === true;

  const markMembersSeen = useCallback(async () => {
    const seanceId = selectedGroupId;
    if (!supervisorAuthId || !seanceId) return;
    await setSeenAt("members", supervisorAuthId, seanceId, new Date().toISOString());
    setSupabaseData((prev) => ({ ...prev, newMembersCount: 0 }));
  }, [supervisorAuthId, selectedGroupId]);

  const markProgressSeen = useCallback(async () => {
    const seanceId = selectedGroupId;
    if (!supervisorAuthId || !seanceId) return;
    await setSeenAt("progress", supervisorAuthId, seanceId, new Date().toISOString());
    setSupabaseData((prev) => ({ ...prev, newProgressCount: 0 }));
  }, [supervisorAuthId, selectedGroupId]);

  const markPresenceSeen = useCallback(async () => {
    const seanceId = selectedGroupId;
    const sessionDate = occurrenceMeta?.sessionDate;
    if (!supervisorAuthId || !seanceId) return;
    if (sessionDate) {
      await setSeenAt("presence", supervisorAuthId, seanceId, String(sessionDate));
    }
    setSupabaseData((prev) => ({ ...prev, presenceDotSeen: true }));
  }, [supervisorAuthId, selectedGroupId, occurrenceMeta?.sessionDate]);

  const refreshNewMembersCount = useCallback(async () => {
    const seanceId = selectedGroupId;
    if (!supervisorAuthId || !seanceId) return;
    const existing = await getSeenAt("members", supervisorAuthId, seanceId);
    if (!existing) {
      await setSeenAt("members", supervisorAuthId, seanceId, new Date().toISOString());
      setSupabaseData((prev) => ({ ...prev, newMembersCount: 0 }));
      return;
    }
    setSupabaseData((prev) => ({
      ...prev,
      newMembersCount: countNewMembersSince(prev.members, existing),
    }));
  }, [supervisorAuthId, selectedGroupId]);

  const refreshNewProgressCount = useCallback(async () => {
    const seanceId = selectedGroupId;
    if (!supervisorAuthId || !seanceId) return;
    const existing = await getSeenAt("progress", supervisorAuthId, seanceId);
    if (!existing) {
      await setSeenAt("progress", supervisorAuthId, seanceId, new Date().toISOString());
      setSupabaseData((prev) => ({ ...prev, newProgressCount: 0 }));
      return;
    }
    const res = await countMembersWithNewProgress(seanceId, existing);
    setSupabaseData((prev) => ({
      ...prev,
      newProgressCount: res.ok ? res.count || 0 : 0,
    }));
  }, [supervisorAuthId, selectedGroupId]);

  return {
    myGroups,
    activeGroup,
    members,
    membersByLatestProgress,
    membersWithStatus,
    attendancePct,
    avgProgress,
    presentCount,
    isMarkingWindowOpen,
    showUnmarkedPresenceDot,
    presenceDotSeen,
    showPresenceReminder,
    newMembersCount,
    newProgressCount,
    markMembersSeen,
    markProgressSeen,
    markPresenceSeen,
    refreshNewMembersCount,
    refreshNewProgressCount,
    loading,
    progressLoading,
    fetchError,
    dataSource: usingSupabase ? "supabase" : "mock",
    refetch,
  };
}
