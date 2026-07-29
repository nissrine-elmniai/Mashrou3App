import { useMemo } from "react";
import { useApp } from "../../../context/AppContext";
import { ATTENDANCE_STATUS } from "../../../constants/roles";
import { deriveLevel, todayIso } from "../supervisorHelpers";

/**
 * Membres de toutes les groupes du superviseur connecté, avec statut de présence
 * du jour calculé si `activeGroup` est fourni (sinon status/pct/level sont omis
 * par les écrans qui n'en ont pas besoin, comme Progress ou Messages).
 */
export function useSupervisorMembers(activeGroup = null) {
  const {
    currentUser,
    getSupervisorGroups,
    getUserById,
    getMemberProgress,
    attendance,
  } = useApp();

  const myGroups = getSupervisorGroups(currentUser?.id);

  const members = useMemo(() => {
    const list = [];
    const seen = new Set();
    myGroups.forEach((g) => {
      g.memberIds.forEach((mid) => {
        if (seen.has(mid)) return;
        seen.add(mid);
        const user = getUserById(mid);
        const prog = getMemberProgress(mid, g.seasonId);
        if (user) list.push({ user, group: g, prog });
      });
    });
    return list;
  }, [myGroups, getUserById, getMemberProgress]);

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
  const attendancePct =
    members.length === 0 ? 0 : Math.round((presentCount / members.length) * 100);
  const avgProgress =
    members.length === 0
      ? 0
      : Math.round(
          membersWithStatus.reduce((sum, m) => sum + m.pct, 0) / membersWithStatus.length
        );

  return { myGroups, members, membersWithStatus, attendancePct, avgProgress, presentCount };
}
