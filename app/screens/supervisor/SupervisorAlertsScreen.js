import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts, arrowBack } from "../../constants/rtl";
import {
  getVisibleAlertsWithAckStatus,
  acknowledgeAlert,
  subscribeToNewAlerts,
} from "../../lib/alertsApi";

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ar-MA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Liste complète des alertes superviseur — acquittement via acknowledgeAlert (RG9). */
export default function SupervisorAlertsScreen({ navigation }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ackingId, setAckingId] = useState(null);

  const load = useCallback(async () => {
    const res = await getVisibleAlertsWithAckStatus();
    if (res.ok) setAlerts(res.alerts);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    return subscribeToNewAlerts(() => load());
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleAcknowledge = async (alertId) => {
    if (ackingId) return;
    setAckingId(alertId);
    const res = await acknowledgeAlert(alertId);
    setAckingId(null);
    if (!res.ok) {
      Alert.alert("تعذر التأكيد", res.error || "حاول مرة أخرى");
      return;
    }
    // Même insert alert_acknowledgments que BlockingAlertGate — débloque RG9 au prochain poll.
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name={arrowBack} size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تنبيهات الإدارة</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
            />
          }
        >
          {alerts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyText}>لا توجد تنبيهات بعد</Text>
            </View>
          ) : (
            alerts.map((alert) => (
              <View
                key={alert.id}
                style={[
                  styles.alertCard,
                  shadows.card,
                  alert.acknowledged ? styles.alertCardAcked : styles.alertCardPending,
                ]}
              >
                <View style={styles.alertTopRow}>
                  <View style={styles.alertMeta}>
                    <Text style={styles.alertTime}>{formatTime(alert.createdAt)}</Text>
                    {alert.senderName ? (
                      <Text style={styles.alertSender}>من {alert.senderName}</Text>
                    ) : null}
                  </View>
                  {alert.acknowledged ? (
                    <View style={styles.ackedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                      <Text style={styles.ackedBadgeText}>مقروء</Text>
                    </View>
                  ) : (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>غير مقروء</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.alertMessage,
                    alert.acknowledged ? styles.alertMessageAcked : styles.alertMessagePending,
                  ]}
                >
                  {alert.message}
                </Text>
                {!alert.acknowledged ? (
                  <TouchableOpacity
                    style={[styles.ackBtn, ackingId === alert.id && styles.ackBtnDisabled]}
                    onPress={() => handleAcknowledge(alert.id)}
                    disabled={ackingId === alert.id}
                    activeOpacity={0.85}
                  >
                    {ackingId === alert.id ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text style={styles.ackBtnText}>تمت القراءة</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.primary,
  },
  backBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    color: "white",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingBottom: 32 },
  emptyWrap: { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyText: { color: colors.muted, fontSize: 15, ...rtlText },
  alertCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  alertCardPending: { borderColor: "#FFCDD2" },
  alertCardAcked: { opacity: 0.88 },
  alertTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8,
  },
  alertMeta: { flex: 1 },
  alertTime: { fontSize: 12, color: colors.muted, ...rtlText },
  alertSender: {
    fontSize: 11,
    color: colors.primary,
    marginTop: 2,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  pendingBadge: {
    backgroundColor: "#FFEBEE",
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingBadgeText: {
    fontSize: 11,
    color: "#D32F2F",
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  ackedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ackedBadgeText: {
    fontSize: 11,
    color: colors.primary,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  alertMessage: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 10,
    ...rtlText,
  },
  alertMessagePending: { color: "#E53935" },
  alertMessageAcked: { color: colors.text },
  ackBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  ackBtnDisabled: { opacity: 0.7 },
  ackBtnText: {
    color: "white",
    fontFamily: fonts.bold,
    fontSize: 14,
    ...rtlTextBold,
  },
});
