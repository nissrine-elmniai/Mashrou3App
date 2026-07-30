import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../../context/AppContext";
import { ATTENDANCE_STATUS } from "../../../constants/roles";
import { deriveLevel, todayIso } from "../supervisorHelpers";
import { getSupervisorActiveSeance, getSeanceMembers } from "../../../lib/membersApi";

function buildScheduleLabel(seance) {
  const heureDebut = seance.heure_debut ? seance.heure_debut.slice(0, 5) : "";
  const heureFin = seance.heure_fin ? seance.heure_fin.slice(0, 5) : "";
  const heures =
    heureDebut && heureFin ? `${heureDebut} - ${heureFin}` : heureDebut || heureFin;
  return [seance.jour, heures].filter(Boolean).join(" ");
}

/**
 * Membres de toutes les groupes du superviseur connecté, avec statut de présence
 * du jour calculé si `activeGroup` est fourni (sinon status/pct/level sont omis
 * par les écrans qui n'en ont pas besoin, comme Progress ou Messages).
 *
 * `myGroups`/`members` sont lus depuis Supabase quand une session Supabase existe
 * (compte superviseur seedé côté Supabase) et retombent sur le mock sinon ou en cas
 * d'erreur réseau. `membersWithStatus`/`attendancePct`/`avgProgress`/`presentCount`
 * restent branchés sur le mock dans tous les cas : ils dépendent de Présence et
 * Progression, non encore migrés côté Supabase (étape future).
 */
export function useSupervisorMembers(activeGroup = null) {
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

  const [supabaseData, setSupabaseData] = useState({
    loaded: false,
    myGroups: [],
    members: [],
  });

  useEffect(() => {
    if (!supervisorAuthId) {
      setSupabaseData({ loaded: false, myGroups: [], members: [] });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const seance = await getSupervisorActiveSeance(supervisorAuthId);
        if (cancelled) return;

        if (!seance) {
          setSupabaseData({ loaded: true, myGroups: [], members: [] });
          return;
        }

        const seanceMembers = await getSeanceMembers(seance.id);
        if (cancelled) return;

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
          },
          group,
          prog: null,
        }));

        setSupabaseData({ loaded: true, myGroups: [group], members });
      } catch (e) {
        console.warn(
          "useSupervisorMembers: échec de lecture Supabase, repli sur le mock —",
          e?.message || e
        );
        if (!cancelled) {
          setSupabaseData({ loaded: false, myGroups: [], members: [] });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supervisorAuthId]);

  const usingSupabase = !!supervisorAuthId && supabaseData.loaded;
  const myGroups = usingSupabase ? supabaseData.myGroups : myGroupsMock;
  const members = usingSupabase ? supabaseData.members : mockMembers;

  const todaysRecord = useMemo(
    () =>
      activeGroup
        ? attendance.find(
            (a) => a.groupId === activeGroup.id && a.date === todayIso()
          )
        : null,
    [attendance, activeGroup]
  );

  // Toujours dérivé du mock : Présence/Progression ne sont pas encore migrés.
  const membersWithStatus = useMemo(
    () =>
      mockMembers.map((m) => {
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
    [mockMembers, todaysRecord]
  );

  const presentCount = membersWithStatus.filter((m) => m.status === "present").length;
  const attendancePct =
    mockMembers.length === 0 ? 0 : Math.round((presentCount / mockMembers.length) * 100);
  const avgProgress =
    mockMembers.length === 0
      ? 0
      : Math.round(
          membersWithStatus.reduce((sum, m) => sum + m.pct, 0) / membersWithStatus.length
        );

  return {
    myGroups,
    members,
    membersWithStatus,
    attendancePct,
    avgProgress,
    presentCount,
    dataSource: usingSupabase ? "supabase" : "mock",
  };
}
