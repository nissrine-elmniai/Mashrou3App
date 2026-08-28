import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../../constants/rtl";
import { EmptyState, QuickButton } from "../../components/ui";
import { MiniStat } from "./components/SupervisorWidgets";
import BroadcastMessageModal from "./components/BroadcastMessageModal";
import { formatMemberCount } from "./supervisorHelpers";

/**
 * Données séance/membres fournies par SupervisorDashboard (un seul fetch hook).
 */
export default function SupervisorHomeScreen({
  activeGroup,
  members = [],
  attendancePct = 0,
  avgProgress = 0,
  onChangeTab,
}) {
  const [broadcastOpen, setBroadcastOpen] = useState(false);

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
              {formatMemberCount(activeGroup.memberIds?.length ?? members.length)}
            </Text>
          </View>
        </View>
      ) : (
        <EmptyState text="لا توجد مجموعة مسندة إليك بعد — انتظر تعيين الإدارة" />
      )}

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
      <QuickButton
        label="إرسال رسالة للجميع"
        icon="chatbubble-ellipses-outline"
        color={colors.primary}
        onPress={openBroadcast}
      />

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
  sessionMembersRow: { flexDirection: row, alignItems: "center", gap: 6, marginTop: 8 },
  sessionMembersText: { color: colors.placeholder, fontSize: 13, ...rtlText },
  statsRow: { flexDirection: row, gap: 10, marginBottom: 14 },
});
