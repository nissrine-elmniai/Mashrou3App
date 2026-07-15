import React, { useMemo } from "react";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  StatCard,
  SectionCard,
  PersonCard,
} from "../../components/ui";
import { ATTENDANCE_STATUS } from "../../constants/roles";
import { colors } from "../../constants/theme";

export default function SupervisorStatisticsScreen({ navigation }) {
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
    myGroups.forEach((g) => {
      g.memberIds.forEach((mid) => {
        const user = getUserById(mid);
        const prog = getMemberProgress(mid, g.seasonId);
        if (user) {
          const progress = Math.min(
            100,
            Math.round(
              ((prog?.hifzPages || 0) / (prog?.targetPages || 1)) * 100
            )
          );
          list.push({ user, group: g, progress, prog });
        }
      });
    });
    return list.sort((a, b) => b.progress - a.progress);
  }, [myGroups, getUserById, getMemberProgress]);

  const avg =
    members.length === 0
      ? 0
      : Math.round(
          members.reduce((s, m) => s + m.progress, 0) / members.length
        );

  const myAttendance = attendance.filter((a) =>
    myGroups.some((g) => g.id === a.groupId)
  );
  let present = 0;
  let total = 0;
  myAttendance.forEach((a) => {
    Object.values(a.records || {}).forEach((v) => {
      total += 1;
      if (v === ATTENDANCE_STATUS.PRESENT) present += 1;
    });
  });
  const attendanceRate = total === 0 ? 0 : Math.round((present / total) * 100);

  return (
    <AppShell
      title="الإحصائيات"
      subtitle="نظرة شاملة على الأداء والحضور"
      icon="stats-chart"
      onBack={() => navigation.goBack()}
    >
      <StatCard
        icon="people"
        iconColor={colors.green}
        borderColor={colors.borderGreen}
        label="إجمالي الأعضاء"
        value={members.length}
        valueColor={colors.green}
      />
      <StatCard
        icon="people-outline"
        iconColor={colors.gold}
        borderColor={colors.borderGold}
        label="مجموعاتي"
        value={myGroups.length}
        valueColor={colors.gold}
      />
      <StatCard
        icon="trending-up-outline"
        iconColor={colors.primary}
        borderColor={colors.borderBlue}
        label="متوسط التقدم"
        value={`${avg}%`}
        valueColor={colors.primary}
      />
      <StatCard
        icon="calendar-outline"
        iconColor={colors.teal}
        borderColor="#99F6E4"
        label="معدل الحضور"
        value={`${attendanceRate}%`}
        valueColor={colors.teal}
      />

      <SectionCard
        title="الأعضاء المتميزون"
        subtitle="أفضل الأعضاء من حيث التقدم في الحفظ"
      >
        {members.slice(0, 5).map((member, index) => (
          <PersonCard
            key={`${member.group.id}_${member.user.id}`}
            initials={String(index + 1)}
            name={`${member.user.firstName} ${member.user.lastName}`}
            meta={[member.group.name, `التقدم ${member.progress}%`]}
          />
        ))}
      </SectionCard>
    </AppShell>
  );
}
