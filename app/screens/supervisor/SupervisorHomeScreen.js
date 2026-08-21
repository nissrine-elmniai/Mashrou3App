import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../../constants/rtl";
import { EmptyState, QuickButton } from "../../components/ui";
import { MiniStat, OutlineButton } from "./components/SupervisorWidgets";
import { useSupervisorMembers } from "./hooks/useSupervisorMembers";
import { getVisibleAlerts, subscribeToNewAlerts } from "../../lib/alertsApi";

export default function SupervisorHomeScreen({ activeGroup, onChangeTab }) {
  const { members, attendancePct, avgProgress } = useSupervisorMembers(activeGroup);
  const [adminAlerts, setAdminAlerts] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await getVisibleAlerts();
      if (!cancelled && res.ok) setAdminAlerts(res.alerts);
    };
    load();
    const unsub = subscribeToNewAlerts(() => {
      load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {activeGroup ? (
        <View style={[styles.sessionCard, shadows.card]}>
          <Text style={styles.sessionTitle}>{activeGroup.name}</Text>
          {activeGroup.schedule ? (
            <Text style={styles.sessionSchedule}>{activeGroup.schedule}</Text>
          ) : null}
          <View style={styles.sessionMembersRow}>
            <Ionicons name="people-outline" size={16} color={colors.placeholder} />
            <Text style={styles.sessionMembersText}>
              {activeGroup.memberIds?.length || 0} عضو
            </Text>
          </View>
        </View>
      ) : (
        <EmptyState text="لا توجد مجموعة مسندة إليك بعد — انتظر تعيين الإدارة" />
      )}

      <View style={[styles.alertsCard, shadows.card]}>
        <Text style={styles.alertsTitle}>تنبيهات الإدارة</Text>
        {adminAlerts.length === 0 ? (
          <Text style={styles.alertsEmpty}>لا توجد تنبيهات بعد</Text>
        ) : (
          adminAlerts.slice(0, 5).map((a) => (
            <View key={a.id} style={styles.alertItem}>
              <Text style={styles.alertText}>{a.message}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.statsRow}>
        <MiniStat value={members.length} label="عدد الأعضاء" color={colors.primary} />
        <MiniStat value={`${attendancePct}%`} label="نسبة الحضور" color={colors.primary} />
        <MiniStat value={`${avgProgress}%`} label="متوسط التقدم" color={colors.primary} />
      </View>

      <QuickButton
        label="تسجيل الحضور "
        icon="checkbox-outline"
        color={colors.gold}
        onPress={() => onChangeTab("attendance")}
      />
      <OutlineButton
        label="إرسال رسالة للجميع"
        icon="chatbubble-ellipses-outline"
        onPress={() => onChangeTab("messages")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 24 },
  sessionCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 14,
  },
  sessionTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, ...rtlTextBold },
  sessionSchedule: { color: colors.muted, fontSize: 13, marginTop: 4, ...rtlText },
  sessionMembersRow: { flexDirection: row, alignItems: "center", gap: 6, marginTop: 8 },
  sessionMembersText: { color: colors.placeholder, fontSize: 13, ...rtlText },
  statsRow: { flexDirection: row, gap: 10, marginBottom: 14 },
  alertsCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 14,
  },
  alertsTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.text,
    marginBottom: 10,
    ...rtlTextBold,
  },
  alertsEmpty: { color: colors.muted, fontSize: 13, ...rtlText },
  alertItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.bg,
  },
  alertText: { color: colors.text, fontSize: 14, lineHeight: 22, ...rtlText },
});
