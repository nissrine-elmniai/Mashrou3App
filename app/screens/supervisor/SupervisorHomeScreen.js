import React, { useState, useMemo, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts, row } from "../../constants/rtl";
import { EmptyState, QuickButton, SectionCard } from "../../components/ui";
import { MiniStat } from "./components/SupervisorWidgets";
import BroadcastMessageModal from "./components/BroadcastMessageModal";
import { getVisibleAlerts, subscribeToNewAlerts } from "../../lib/alertsApi";
import { formatRelativeTime } from "../../lib/messagesApi";
import { useSupervisorActivity } from "./hooks/useSupervisorActivity";

/**
 * Données séance/membres fournies par SupervisorDashboard (un seul fetch hook).
 */
export default function SupervisorHomeScreen({
  activeGroup,
  members = [],
  attendancePct = 0,
  avgProgress = 0,
  isMarkingWindowOpen = false,
  showPresenceReminder = false,
  onChangeTab,
  threads = [],
  dataSource = "mock",
}) {
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const { activities } = useSupervisorActivity({
    seanceId: activeGroup?.id || null,
    members,
    threads,
    enabled: dataSource === "supabase",
  });

  const loadRecentAlerts = useCallback(async () => {
    const res = await getVisibleAlerts();
    if (res.ok) setRecentAlerts(res.alerts.slice(0, 3));
  }, []);

  useEffect(() => {
    loadRecentAlerts();
    return subscribeToNewAlerts(() => loadRecentAlerts());
  }, [loadRecentAlerts]);

  useFocusEffect(
    useCallback(() => {
      loadRecentAlerts();
    }, [loadRecentAlerts])
  );

  const memberIds = useMemo(
    () => members.map((m) => m.user?.id).filter(Boolean),
    [members]
  );

  const openBroadcast = () => {
    if (!activeGroup?.id) {
      Alert.alert("تنبيه", "لا توجد حصة نشطة");
      return;
    }
    if (memberIds.length === 0) {
      Alert.alert("تنبيه", "لا يوجد أعضاء لإرسال الرسالة");
      return;
    }
    setBroadcastOpen(true);
  };

  const quickBtnLabelStyle = {
    fontSize: 16,
    color: "white",
    ...rtlText,
    textAlign: "center",
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {activeGroup ? (
        <View style={[styles.sessionCard, shadows.card]}>
          <Text style={styles.sessionTitle}>{activeGroup.name}</Text>
          {activeGroup.schedule ? (
            <Text style={styles.sessionSchedule} numberOfLines={1}>
              {activeGroup.schedule}
            </Text>
          ) : null}
        </View>
      ) : (
        <EmptyState text="لا توجد مجموعة مسندة إليك بعد — انتظر تعيين الإدارة" />
      )}

      {showPresenceReminder ? (
        <View style={styles.reminderBanner}>
          <Text style={styles.reminderText}> لم يتم تسجيل الحضور بعد !</Text>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <MiniStat value={members.length} label="عدد الأعضاء" color={colors.primary} />
        <MiniStat value={`${attendancePct}%`} label=" نسبة الحضور" color={colors.primary} />
        <MiniStat value={`${avgProgress}%`} label="متوسط التقدم" color={colors.primary} />
      </View>

      <QuickButton
        label={isMarkingWindowOpen ? " تسجيل الحضور" : " سجل الحضور"}
        icon="checkbox-outline"
        color={colors.gold}
        textStyle={quickBtnLabelStyle}
        onPress={() => onChangeTab("attendance")}
      />
      <QuickButton
        label="إرسال رسالة للجميع"
        icon="chatbubble-ellipses-outline"
        color={colors.primary}
        textStyle={quickBtnLabelStyle}
        onPress={openBroadcast}
      />

      {recentAlerts.length > 0 ? (
        <SectionCard title="الإشعارات" borderColor={colors.card}>
          {recentAlerts.map((alert) => (
            <View key={alert.id} style={styles.activityRow}>
              <View style={styles.activityIconWrap}>
                <Ionicons
                  name="notifications-outline"
                  size={16}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.activityText} numberOfLines={2}>
                {alert.message}
              </Text>
              <Text style={styles.activityWhen}>
                {formatRelativeTime(alert.createdAt)}
              </Text>
            </View>
          ))}
        </SectionCard>
      ) : null}

      {activities.length > 0 ? (
        <SectionCard title="آخر النشاطات" borderColor={colors.card}>
          {activities.map((activity) => (
            <View key={activity.id} style={styles.activityRow}>
              <View style={styles.activityIconWrap}>
                <Ionicons
                  name={activity.icon}
                  size={16}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.activityText} numberOfLines={2}>
                {activity.title}
              </Text>
              <Text style={styles.activityWhen}>
                {formatRelativeTime(activity.at)}
              </Text>
            </View>
          ))}
        </SectionCard>
      ) : null}

      <BroadcastMessageModal
        visible={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        memberIds={memberIds}
        seanceId={activeGroup?.id}
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
  reminderBanner: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radii.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  reminderText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.text,
    ...rtlText,
  },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  activityRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  activityIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  activityText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  activityWhen: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.regular,
    ...rtlText,
  },
});
