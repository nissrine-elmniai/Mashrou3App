import { useEffect, useMemo, useState } from "react";
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

function buildGroupFromSeance(seance, seanceMembers = []) {
  return {
    id: seance.id,
    name: seance.nom,
    seasonId: seance.saison_id,
    saisonDateDebut: seance.saisons?.date_debut || null,
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
      phone: m.telephone,
      school: m.ecole,
      level: m.niveau,
      hifzAmount: m.quantiteHifz,
      birthDate: m.dateNaissance,
      gender: m.genre,
    },
    group,
    prog: null,
    registrationStatus: m.statutInscription,
    registrationDate: m.dateInscription,
  }));
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

  const refetch = () => setRefreshKey((k) => k + 1);

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
      });
      return;
    }

    let cancelled = false;
    setFetchState({ loading: true, loaded: false, error: null });

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

        let weeklyPresenceByMember = {};
        let occurrenceMeta = null;
        const occurrence = getLatestSeanceOccurrence(
          seance.jour,
          new Date(),
          seance.heure_debut || null
        );
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
          const isMarked = Object.values(weeklyPresenceByMember).some(
            (s) => s === "present" || s === "absent"
          );
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
        });
        setFetchState({ loading: false, loaded: true, error: null });
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

  const loading = !!supervisorAuthId && fetchState.loading;
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

  const activeGroup =
    myGroups.find((g) => g.id === selectedGroupId) || myGroups[0] || null;

  const weeklyPresenceByMember = usingSupabase ? supabaseData.weeklyPresenceByMember : {};
  const occurrenceMeta = usingSupabase ? supabaseData.occurrenceMeta : null;

  const isMarkingWindowOpen =
    usingSupabase && occurrenceMeta?.withinMarkingWindow === true;

  const showPresenceReminder =
    usingSupabase && supabaseData.showPresenceReminder === true;

  const membersWithStatus = useMemo(
    () =>
      members.map((m) => {
        const pct = Math.min(
          100,
          Math.round(((m.prog?.hifzPages || 0) / (m.prog?.targetPages || 1)) * 100)
        );
        const status = usingSupabase
          ? weeklyPresenceToMemberStatus(
              weeklyPresenceByMember[m.user.id],
              occurrenceMeta || {}
            )
          : "none";
        return { ...m, pct, level: deriveLevel(pct), status };
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
  const avgProgress = usingSupabase
    ? 0
    : membersWithStatus.length === 0
    ? 0
    : Math.round(
        membersWithStatus.reduce((sum, m) => sum + m.pct, 0) / membersWithStatus.length
      );

  return {
    myGroups,
    activeGroup,
    members,
    membersWithStatus,
    attendancePct,
    avgProgress,
    presentCount,
    isMarkingWindowOpen,
    showPresenceReminder,
    loading,
    fetchError,
    dataSource: usingSupabase ? "supabase" : "mock",
    refetch,
  };
}
