import React, { useMemo } from "react";
import { Text, StyleSheet, View } from "react-native";
import { useApp } from "../../context/AppContext";
import { AppShell, StatCard, SectionCard } from "../../components/ui";
import { colors } from "../../constants/theme";
import { REGISTRATION_STATUS, SEASON_TYPES } from "../../constants/roles";
import { rtlText } from "../../constants/rtl";

export default function AdminStatsScreen({ navigation }) {
  const { registrations, exams, progress, seasons, groups } = useApp();

  const byType = (type) => seasons.filter((s) => s.type === type);
  const regsOfType = (type) =>
    registrations.filter((r) => {
      const s = seasons.find((x) => x.id === r.seasonId);
      return s?.type === type;
    });
  const groupsOfType = (type) =>
    groups.filter((g) => {
      const s = seasons.find((x) => x.id === g.seasonId);
      return s?.type === type;
    });

  const regularRegs = regsOfType(SEASON_TYPES.REGULAR);
  const summerRegs = regsOfType(SEASON_TYPES.SUMMER);

  const top = useMemo(
    () =>
      [...progress]
        .map((p) => ({
          ...p,
          pct: Math.min(
            100,
            Math.round(((p.hifzPages || 0) / (p.targetPages || 1)) * 100)
          ),
        }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5),
    [progress]
  );

  return (
    <AppShell
      title="الإحصائيات والتقارير"
      subtitle="موسم عادي ومدرسة صيفية بشكل منفصل"
      icon="stats-chart"
      onBack={() => navigation.goBack()}
    >
      <SectionCard title="المواسم العادية" subtitle="ملخص الموسم الدراسي">
        <StatCard
          icon="calendar-outline"
          iconColor={colors.primary}
          borderColor={colors.borderBlue}
          label="عدد المواسم"
          value={byType(SEASON_TYPES.REGULAR).length}
          valueColor={colors.primary}
        />
        <StatCard
          icon="people-outline"
          iconColor={colors.green}
          borderColor={colors.borderGreen}
          label="مجموعات الموسم"
          value={groupsOfType(SEASON_TYPES.REGULAR).length}
          valueColor={colors.green}
        />
        <StatCard
          icon="checkmark-circle-outline"
          iconColor={colors.primary}
          borderColor={colors.borderBlue}
          label="طلبات مقبولة"
          value={
            regularRegs.filter(
              (r) => r.status === REGISTRATION_STATUS.ACCEPTED
            ).length
          }
          valueColor={colors.primary}
        />
        <StatCard
          icon="time-outline"
          iconColor={colors.orange}
          borderColor="#FFE0B2"
          label="طلبات معلّقة"
          value={
            regularRegs.filter(
              (r) => r.status === REGISTRATION_STATUS.PENDING
            ).length
          }
          valueColor={colors.orange}
        />
      </SectionCard>

      <SectionCard
        title="المدرسة الصيفية"
        subtitle="ملخص الدورات الصيفية"
        primary={colors.orange}
        borderColor="#FDE68A"
      >
        <StatCard
          icon="sunny-outline"
          iconColor={colors.orange}
          borderColor="#FDE68A"
          label="عدد الدورات الصيفية"
          value={byType(SEASON_TYPES.SUMMER).length}
          valueColor={colors.orange}
        />
        <StatCard
          icon="people-outline"
          iconColor={colors.orange}
          borderColor="#FDE68A"
          label="مجموعات صيفية"
          value={groupsOfType(SEASON_TYPES.SUMMER).length}
          valueColor={colors.orange}
        />
        <StatCard
          icon="checkmark-circle-outline"
          iconColor={colors.orange}
          borderColor="#FDE68A"
          label="طلبات صيفية مقبولة"
          value={
            summerRegs.filter(
              (r) => r.status === REGISTRATION_STATUS.ACCEPTED
            ).length
          }
          valueColor={colors.orange}
        />
      </SectionCard>

      <StatCard
        icon="school-outline"
        iconColor={colors.gold}
        borderColor={colors.borderGold}
        label="الاختبارات المسجّلة"
        value={exams.length}
        valueColor={colors.gold}
      />

      <SectionCard title="أعلى الأعضاء تقدّماً" subtitle="أفضل 5 أعضاء">
        {top.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.pct}>{p.pct}%</Text>
            <Text style={styles.meta}>
              حفظ: {p.hifzPages} • مراجعة: {p.reviewPages}
            </Text>
          </View>
        ))}
      </SectionCard>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pct: {
    ...rtlText,
    fontWeight: "bold",
    color: colors.primary,
    fontSize: 18,
  },
  meta: { ...rtlText, color: colors.muted, marginTop: 4 },
});
