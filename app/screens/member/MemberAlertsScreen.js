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

/** Liste des notifications membre — uniquement après la date d'inscription. */
export default function MemberAlertsScreen({ navigation }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ackingId, setAckingId] = useState(null);

  const load = useCallback(async () => {
    const res = await getVisibleAlertsWithAckStatus({
      sinceMemberRegistration: true,
    });
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
          hitSlop={8}
        >
          <Ionicons name={arrowBack} size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الإشعارات</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {alerts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons
                name="notifications-off-outline"
                size={40}
                color={colors.muted}
              />
              <Text style={styles.emptyText}>لا توجد إشعارات جديدة</Text>
              <Text style={styles.emptyHint}>
                تظهر هنا فقط التنبيهات المرسلة بعد تاريخ تسجيلك
              </Text>
            </View>
          ) : (
            alerts.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.sender}>{item.senderName || "الإدارة"}</Text>
                  <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
                </View>
                <Text style={styles.message}>{item.message}</Text>
                {item.acknowledged ? (
                  <Text style={styles.acked}>تم الاطلاع</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.ackBtn}
                    onPress={() => handleAcknowledge(item.id)}
                    disabled={ackingId === item.id}
                  >
                    <Text style={styles.ackBtnText}>
                      {ackingId === item.id ? "جاري..." : "تم الاطلاع"}
                    </Text>
                  </TouchableOpacity>
                )}
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
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 40, alignItems: "center" },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 16, paddingBottom: 40 },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 64,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: colors.text,
    marginTop: 8,
    ...rtlText,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    ...rtlText,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sender: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.primary,
    ...rtlText,
  },
  time: { fontSize: 12, color: colors.muted, ...rtlText },
  message: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    ...rtlText,
  },
  acked: {
    marginTop: 10,
    fontSize: 12,
    color: colors.muted,
    ...rtlText,
  },
  ackBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: colors.soft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  ackBtnText: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    ...rtlText,
  },
});
