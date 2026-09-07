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
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, fonts, arrowBack, row } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
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
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <View style={styles.headerWrap}>
        <LinearGradient colors={colors.gradientHeader} style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.goBack()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="رجوع"
            >
              <Ionicons name={arrowBack} size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>الإشعارات</Text>
              <Text style={styles.headerSubtitle}>
                تنبيهات الإدارة منذ تاريخ تسجيلك
              </Text>
            </View>
            <View style={styles.headerBtn} />
          </View>
        </LinearGradient>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {alerts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons
                name="notifications-off-outline"
                size={36}
                color={colors.primary}
              />
              <EmptyState text="لا توجد إشعارات جديدة" />
              <Text style={styles.emptyHint}>
                تظهر هنا فقط التنبيهات المرسلة بعد تاريخ تسجيلك
              </Text>
            </View>
          ) : (
            alerts.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.card,
                  item.acknowledged ? styles.cardAcked : styles.cardNew,
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.senderRow}>
                    <View style={styles.iconBadge}>
                      <Ionicons
                        name="notifications-outline"
                        size={16}
                        color={colors.primary}
                      />
                    </View>
                    <Text style={styles.sender}>
                      {item.senderName || "الإدارة"}
                    </Text>
                  </View>
                  <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
                </View>
                <View style={styles.goldLine} />
                <Text style={styles.message}>{item.message}</Text>
                {item.acknowledged ? (
                  <View style={styles.ackedRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={colors.primary}
                    />
                    <Text style={styles.acked}>تم الاطلاع</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.ackBtn}
                    onPress={() => handleAcknowledge(item.id)}
                    disabled={ackingId === item.id}
                    activeOpacity={0.85}
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
  safe: { flex: 1, backgroundColor: colors.bg },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  header: {
    borderRadius: radii.lg,
    overflow: "hidden",
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: row,
    alignItems: "center",
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    marginTop: 4,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { padding: 16, paddingBottom: 40 },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: 28,
    alignItems: "center",
    ...shadows.card,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 20,
    ...rtlText,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    ...shadows.card,
  },
  cardNew: {
    borderColor: colors.borderGreen,
    backgroundColor: colors.soft,
  },
  cardAcked: {
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cardTop: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  senderRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  sender: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.primary,
    flexShrink: 1,
    ...rtlText,
  },
  time: { fontSize: 12, color: colors.muted, ...rtlText },
  goldLine: {
    height: 2,
    backgroundColor: colors.gold,
    borderRadius: 1,
    marginBottom: 12,
    opacity: 0.85,
  },
  message: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  ackedRow: {
    marginTop: 12,
    flexDirection: row,
    alignItems: "center",
    gap: 6,
  },
  acked: {
    fontSize: 12,
    color: colors.primary,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  ackBtn: {
    marginTop: 14,
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: "center",
  },
  ackBtnText: {
    color: "#fff",
    fontFamily: fonts.semiBold,
    fontSize: 14,
    ...rtlText,
  },
});
