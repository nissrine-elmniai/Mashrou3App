import React, { useEffect, useMemo, useState } from "react";
import { Text, StyleSheet, View } from "react-native";
import { AppShell, StatCard, SectionCard } from "../../components/ui";
import { colors } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";
import {
  getMemberProfiles,
  getSupervisorProfiles,
  getAllSeances,
} from "../../lib/seancesApi";
import { getAllTestsAdmin } from "../../lib/testsApi";
import { getAllProgressionAdmin } from "../../lib/progressApi";
import { countPendingApplications } from "../../lib/memberApplicationsApi";

export default function AdminStatsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [membersCount, setMembersCount] = useState(0);
  const [supervisorsCount, setSupervisorsCount] = useState(0);
  const [seancesCount, setSeancesCount] = useState(0);
  const [testsCount, setTestsCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [progressions, setProgressions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [profRes, supRes, seaRes, testRes, pendRes, progRes] =
        await Promise.all([
          getMemberProfiles(),
          getSupervisorProfiles(),
          getAllSeances(),
          getAllTestsAdmin(),
          countPendingApplications(),
          getAllProgressionAdmin(),
        ]);
      if (cancelled) return;
      if (profRes.ok) setMembersCount(profRes.members.length);
      if (supRes.ok) setSupervisorsCount(supRes.supervisors.length);
      if (seaRes.ok) setSeancesCount(seaRes.seances.length);
      if (testRes.ok) setTestsCount(testRes.tests.length);
      if (pendRes.ok) setPendingCount(pendRes.count);
      if (progRes.ok) setProgressions(progRes.entries);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Progression moyenne + top 5 : dernier juz mémorisé de chaque membre. */
  const { avgPct, top } = useMemo(() => {
    const byMember = {};
    progressions.forEach((e) => {
      const key = e.membre_id;
      const pct = Math.min(100, Math.round((e.juze / 30) * 100));
      if (!byMember[key]) {
        byMember[key] = {
          id: e.id,
          membreId: e.membre_id,
          name:
            `${e.membre?.first_name || ""} ${e.membre?.last_name || ""}`.trim() ||
            e.membre?.email ||
            "عضو",
          juze: e.juze,
          pct,
        };
      }
    });
    const list = Object.values(byMember);
    const avg =
      list.length === 0
        ? 0
        : Math.round(list.reduce((sum, m) => sum + m.pct, 0) / list.length);
    const topList = [...list].sort((a, b) => b.pct - a.pct).slice(0, 5);
    return { avgPct: avg, top: topList };
  }, [progressions]);

  return (
    <AppShell
      title="الإحصائيات والتقارير"
      subtitle="مؤشرات حية من قاعدة البيانات"
      icon="stats-chart"
      onBack={() => navigation.goBack()}
    >
      {loading ? (
        <View style={styles.card}>
          <Text style={styles.meta}>جاري التحميل...</Text>
        </View>
      ) : (
        <>
          <SectionCard title="الأعضاء" subtitle="ملخص الموارد البشرية">
            <StatCard
              icon="people-outline"
              iconColor={colors.primary}
              borderColor={colors.borderBlue}
              label="عدد الأعضاء"
              value={membersCount}
              valueColor={colors.primary}
            />
            <StatCard
              icon="person-outline"
              iconColor={colors.orange}
              borderColor="#FFE0B2"
              label="عدد المشرفين"
              value={supervisorsCount}
              valueColor={colors.orange}
            />
          </SectionCard>

          <SectionCard
            title="الحصص والاختبارات"
            subtitle="الحصص النشطة والمؤرشفة + اختبارات مسجلة"
            primary={colors.green}
            borderColor={colors.borderGreen}
          >
            <StatCard
              icon="calendar-outline"
              iconColor={colors.primary}
              borderColor={colors.borderBlue}
              label="عدد الحصص"
              value={seancesCount}
              valueColor={colors.primary}
            />
            <StatCard
              icon="clipboard-outline"
              iconColor={colors.gold}
              borderColor={colors.borderGold}
              label="الاختبارات المسجّلة"
              value={testsCount}
              valueColor={colors.gold}
            />
            <StatCard
              icon="time-outline"
              iconColor={colors.orange}
              borderColor="#FFE0B2"
              label="طلبات تسجيل معلّقة"
              value={pendingCount}
              valueColor={colors.orange}
            />
          </SectionCard>

          <StatCard
            icon="trending-up-outline"
            iconColor={colors.primary}
            borderColor={colors.borderBlue}
            label="متوسط نسبة الحفظ"
            value={`${avgPct}%`}
            valueColor={colors.primary}
          />

          <SectionCard title="أعلى الأعضاء تقدّماً" subtitle="أفضل 5 أعضاء">
            {top.length === 0 ? (
              <Text style={styles.meta}>لا توجد سجلات تقدم بعد</Text>
            ) : (
              top.map((p) => (
                <View key={p.membreId} style={styles.card}>
                  <View style={styles.flexRow}>
                    <Text style={styles.name}>{p.name}</Text>
                    <Text style={styles.pct}>{p.pct}%</Text>
                  </View>
                  <Text style={styles.meta}>
                    آخر حفظ: جزء {p.juze} من 30
                  </Text>
                </View>
              ))
            )}
          </SectionCard>
        </>
      )}
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
  flexRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  name: {
    ...rtlText,
    fontWeight: "bold",
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  pct: {
    ...rtlText,
    fontWeight: "bold",
    color: colors.primary,
    fontSize: 18,
  },
  meta: { ...rtlText, color: colors.muted, marginTop: 4 },
});