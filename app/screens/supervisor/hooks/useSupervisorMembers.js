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
 * d'erreur réseau. `membersWithStatus` est dérivé de `members` (donc Supabase ou mock
 * selon le cas). `attendancePct`/`avgProgress` restent à 0 en mode Supabase (Présence et
 * Progression non encore migrées côté Supabase — étape future) ; `presentCount` en
 * découle naturellement puisqu'aucun membre n'a de statut "present" tant que la Présence
 * n'est pas branchée.
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
            phone: m.telephone,
            birthDate: m.dateNaissance,
            gender: m.genre,
          },
          group,
          prog: null,
          // Colonnes de la ligne `inscriptions` elle-même (statut/date de rattachement
          // à la séance) — distinctes des infos personnelles du membre ci-dessus.
          registrationStatus: m.statutInscription,
          registrationDate: m.dateInscription,
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

  // Dérivé de `members` (source réelle : Supabase si usingSupabase, mock sinon), pas de
  // mockMembers en dur — sinon SupervisorMembersScreen n'affiche jamais les vrais membres.
  // `prog` vaut null pour les membres Supabase (Progression non migrée) : le calcul de `pct`
  // retombe alors naturellement sur 0 grâce aux valeurs par défaut ci-dessous, sans branche
  // spéciale à ajouter et sans casser la forme d'objet attendue par MemberRow.
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

  // Présence/Progression ne sont pas encore migrées côté Supabase (pas de table
  // presences/progression branchée ici) : en mode Supabase on renvoie 0 explicitement
  // plutôt qu'un pourcentage calculé sur des données absentes. Le mode mock est inchangé.
  // 0 plutôt que null pour ne pas afficher "null%" dans SupervisorHomeScreen (MiniStat),
  // en attendant le branchement réel lors de la migration des blocs Présence et Progression.
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
    members,
    membersWithStatus,
    attendancePct,
    avgProgress,
    presentCount,
    dataSource: usingSupabase ? "supabase" : "mock",
  };
}
