import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../../context/AppContext";
import { ATTENDANCE_STATUS } from "../../../constants/roles";
import { deriveLevel, todayIso } from "../supervisorHelpers";
import { getSupervisorActiveSeance, getSeanceMembers } from "../../../lib/membersApi";

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
    attendance,
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

  const [fetchState, setFetchState] = useState({
    loading: false,
    loaded: false,
    error: null,
  });
  const [supabaseData, setSupabaseData] = useState({
    myGroups: [],
    members: [],
  });

  useEffect(() => {
    if (!supervisorAuthId) {
      setFetchState({ loading: false, loaded: false, error: null });
      setSupabaseData({ myGroups: [], members: [] });
      return;
    }

    let cancelled = false;
    setFetchState({ loading: true, loaded: false, error: null });

    (async () => {
      try {
        const seanceRes = await getSupervisorActiveSeance(supervisorAuthId);
        if (cancelled) return;

        if (!seanceRes.ok) {
          console.warn(
            "useSupervisorMembers: échec lecture séance Supabase —",
            seanceRes.error
          );
          setSupabaseData({ myGroups: [], members: [] });
          setFetchState({
            loading: false,
            loaded: false,
            error: seanceRes.error || SUPERVISOR_FETCH_DEGRADED_MESSAGE,
          });
          return;
        }

        const seance = seanceRes.seance;
        if (!seance) {
          setSupabaseData({ myGroups: [], members: [] });
          setFetchState({ loading: false, loaded: true, error: null });
          return;
        }

        const membersRes = await getSeanceMembers(seance.id);
        if (cancelled) return;

        if (!membersRes.ok) {
          console.warn(
            "useSupervisorMembers: échec lecture membres Supabase —",
            membersRes.error
          );
          setSupabaseData({ myGroups: [], members: [] });
          setFetchState({
            loading: false,
            loaded: false,
            error: membersRes.error || SUPERVISOR_FETCH_DEGRADED_MESSAGE,
          });
          return;
        }

        const seanceMembers = membersRes.members;
        const group = {
          id: seance.id,
          name: seance.nom,
          seasonId: seance.saison_id,
          supervisorId: seance.superviseur_id,
          memberIds: seanceMembers.map((m) => m.userId),
          schedule: buildScheduleLabel(seance),
        };

        const members = seanceMembers.map((m) => ({
          user: {
            id: m.userId,
            firstName: m.prenom,
            lastName: m.nom,
            email: m.email,
            phone: m.telephone,
            birthDate: m.dateNaissance,
            gender: m.genre,
          },
          group,
          prog: null,
          registrationStatus: m.statutInscription,
          registrationDate: m.dateInscription,
        }));

        setSupabaseData({ myGroups: [group], members });
        setFetchState({ loading: false, loaded: true, error: null });
      } catch (e) {
        console.warn(
          "useSupervisorMembers: erreur réseau/timeout, repli sur le mock —",
          e?.message || e
        );
        if (!cancelled) {
          setSupabaseData({ myGroups: [], members: [] });
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
  }, [supervisorAuthId]);

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

  const todaysRecord = useMemo(
    () =>
      activeGroup
        ? attendance.find(
            (a) => a.groupId === activeGroup.id && a.date === todayIso()
          )
        : null,
    [attendance, activeGroup]
  );

  const membersWithStatus = useMemo(
    () =>
      members.map((m) => {
        const pct = Math.min(
          100,
          Math.round(((m.prog?.hifzPages || 0) / (m.prog?.targetPages || 1)) * 100)
        );
        const st = todaysRecord?.records?.[m.user.id];
        const status =
          st === ATTENDANCE_STATUS.PRESENT
            ? "present"
            : st === ATTENDANCE_STATUS.ABSENT
            ? "absent"
            : "none";
        return { ...m, pct, level: deriveLevel(pct), status };
      }),
    [members, todaysRecord]
  );

  const presentCount = membersWithStatus.filter((m) => m.status === "present").length;

  const attendancePct = usingSupabase
    ? 0
    : members.length === 0
    ? 0
    : Math.round((presentCount / members.length) * 100);
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
    loading,
    fetchError,
    dataSource: usingSupabase ? "supabase" : "mock",
  };
}
