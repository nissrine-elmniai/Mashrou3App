import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell, Megaphone, Check } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { rtlText, row } from "../../constants/rtl";
import { colors } from "../../constants/theme";
import InboxHeaderButton from "../../components/InboxHeaderButton";
import { sendAlert, getAllAlertsAdmin } from "../../lib/alertsApi";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";
import { UnderlinedTitle } from "../../components/stats/StatsCharts";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  softGold: "#FFF8E1",
  blue: "#1976D2",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
};

function formatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ar-MA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const AUDIENCE_LABELS = {
  all: "الجميع",
  members: "الأعضاء",
  supervisors: "المشرفون",
};

const CONFIRM_PREVIEW_MAX = 160;

function confirmAudienceLabel(audience) {
  if (audience === "members") return "الأعضاء";
  if (audience === "supervisors") return "المشرفون";
  return "الأعضاء والمشرفون";
}

export default function AdminNotificationsScreen({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "notifications");
  const { currentUser, stats, seasons } = useApp();
  const activeSeasonId = getActiveRegularSeason(seasons)?.id || null;
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const [alertText, setAlertText] = useState("");
  const [toMembers, setToMembers] = useState(true);
  const [toSupervisors, setToSupervisors] = useState(true);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const pendingCount = stats?.pendingRegs ?? 0;

  // Admin : uniquement les alertes de la saison courante.
  const loadHistory = useCallback(async () => {
    if (!activeSeasonId) {
      setHistory([]);
      setLoadingHistory(false);
      return;
    }
    const res = await getAllAlertsAdmin({ saisonId: activeSeasonId });
    if (res.ok) setHistory(res.alerts);
    setLoadingHistory(false);
  }, [activeSeasonId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const resolveAudience = () => {
    if (toMembers && toSupervisors) return "all";
    if (toMembers) return "members";
    if (toSupervisors) return "supervisors";
    return null;
  };

  const canSend = Boolean(alertText.trim()) && (toMembers || toSupervisors);

  const performSend = async (audience, message) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    const result = await sendAlert(message, audience, {
      saisonId: activeSeasonId,
    });
    sendingRef.current = false;
    setSending(false);
    if (!result.ok) {
      Alert.alert("فشل الإرسال", result.error);
      return;
    }
    setAlertText("");
    const dest =
      audience === "members"
        ? "الأعضاء"
        : audience === "supervisors"
          ? "المشرفين"
          : "الأعضاء والمشرفين";
    Alert.alert("تم الإرسال", `تم إرسال التنبيه إلى ${dest}`);
    loadHistory();
  };

  const handleSend = () => {
    const audience = resolveAudience();
    if (!audience) {
      Alert.alert("تنبيه", "اختر الأعضاء أو المشرفين أو الاثنين معاً");
      return;
    }
    const message = alertText.trim();
    if (!message) {
      Alert.alert("تنبيه", "اكتب نص التنبيه أولاً");
      return;
    }
    if (sendingRef.current) return;
    const preview =
      message.length > CONFIRM_PREVIEW_MAX
        ? `${message.slice(0, CONFIRM_PREVIEW_MAX)}…`
        : message;
    Alert.alert(
      "تأكيد الإرسال",
      `${preview}\n\n${confirmAudienceLabel(audience)}\n\nلا يمكن تعديل التنبيه أو حذفه بعد الإرسال`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "إرسال", onPress: () => performSend(audience, message) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={openSidebar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>التنبيهات</Text>
        <AdminTopBarAvatar
          currentUser={currentUser}
          onPress={() => navigation.navigate("AdminProfile")}
        />
        <InboxHeaderButton
          navigation={navigation}
          color={colors.muted}
          variant="lucide"
          size={24}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="طلبات الانضمام والتسجيل"
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.scroll}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + bottomGap },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[palette.primary]}
            />
          }
        >
          <View style={styles.composer}>
            <View style={styles.composerHeader}>
              <Megaphone
                size={18}
                color={palette.textPrimary}
                pointerEvents="none"
              />
              <UnderlinedTitle style={styles.composerTitle}>
                إرسال تنبيه عاجل
              </UnderlinedTitle>
            </View>
            <TextInput
              style={styles.composerInput}
              placeholder="نص التنبيه… (يظهر فوراً لجميع المعنيين)"
              placeholderTextColor={palette.placeholder}
              value={alertText}
              onChangeText={setAlertText}
              multiline
              maxLength={500}
            />
            <UnderlinedTitle style={[styles.composerTitle, styles.audienceLabel]}>
              المستهدفون
            </UnderlinedTitle>
            <View style={styles.audienceRow}>
              <TouchableOpacity
                style={[styles.chip, toMembers ? styles.chipChecked : styles.chipUnchecked]}
                onPress={() => setToMembers((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: toMembers }}
                accessibilityLabel="الأعضاء"
              >
                {toMembers ? (
                  <Check size={14} color={colors.card} strokeWidth={3} />
                ) : null}
                <Text
                  style={[
                    styles.chipText,
                    toMembers ? styles.chipTextChecked : styles.chipTextUnchecked,
                  ]}
                >
                  الأعضاء
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  toSupervisors ? styles.chipChecked : styles.chipUnchecked,
                ]}
                onPress={() => setToSupervisors((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: toSupervisors }}
                accessibilityLabel="المشرفون"
              >
                {toSupervisors ? (
                  <Check size={14} color={colors.card} strokeWidth={3} />
                ) : null}
                <Text
                  style={[
                    styles.chipText,
                    toSupervisors ? styles.chipTextChecked : styles.chipTextUnchecked,
                  ]}
                >
                  المشرفون
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[
                styles.sendBtn,
                !canSend && !sending && styles.sendBtnDisabled,
              ]}
              onPress={canSend && !sending ? handleSend : undefined}
              disabled={!canSend || sending}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend || sending }}
            >
              {sending ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <Text
                  style={[
                    styles.sendBtnText,
                    !canSend && styles.sendBtnTextDisabled,
                  ]}
                >
                  إرسال التنبيه
                </Text>
              )}
            </TouchableOpacity>
          
          </View>

          <View style={styles.sectionTitleWrap}>
            <UnderlinedTitle style={styles.sectionTitle}>
              سجل التنبيهات
            </UnderlinedTitle>
          </View>

          {loadingHistory ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={palette.primary} />
            </View>
          ) : history.length === 0 ? (
            <Text style={styles.emptyText}>لا توجد تنبيهات بعد</Text>
          ) : (
            history.map((item) => (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.historyTop}>
                  <Text style={styles.historyMessage} numberOfLines={3}>
                    {item.message}
                  </Text>
                  <View style={styles.historyBadge}>
                    <Text style={styles.historyBadgeText}>
                      {AUDIENCE_LABELS[item.audience] || item.audience}
                    </Text>
                  </View>
                </View>
                <View style={styles.historyMeta}>
                  <Text style={styles.historyDate}>
                    {formatTime(item.createdAt)}
                    {item.saisonId
                      ? ` · ${
                          seasons.find((s) => s.id === item.saisonId)?.name ||
                          "موسم"
                        }`
                      : ""}
                  </Text>
                  <Text style={styles.historyAck}>
                    قرأها {item.ackCount} من المستهدفين
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {messagesFab}
      {sidebar}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  topBar: {
    backgroundColor: "#fff",
    padding: 16,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  topBarTitle: {
    flex: 1,
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    ...rtlText,
  },
  topBarAvatar: {
    width: 32,
    height: 32,
    backgroundColor: palette.softGreen,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarAvatarText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 14,
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    end: -6,
    backgroundColor: palette.red,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
  },
  composer: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 20,
  },
  composerHeader: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  composerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    ...rtlText,
  },
  composerInput: {
    minHeight: 84,
    maxHeight: 140,
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    fontSize: 14,
    color: palette.textPrimary,
    textAlignVertical: "top",
    ...rtlText,
  },
  audienceLabel: {
    marginTop: 10,
  },
  audienceRow: {
    flexDirection: row,
    gap: 10,
    marginTop: 8,
  },
  chip: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipUnchecked: {
    backgroundColor: "transparent",
    borderColor: colors.border,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    ...rtlText,
  },
  chipTextChecked: {
    color: colors.card,
  },
  chipTextUnchecked: {
    color: colors.textSecondary,
  },
  sendBtn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 8,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.disabled,
  },
  sendBtnText: {
    color: colors.card,
    fontSize: 15,
    fontWeight: "700",
    ...rtlText,
  },
  sendBtnTextDisabled: {
    color: colors.muted,
  },
  composerHint: {
    marginTop: 10,
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  sectionTitleWrap: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.textPrimary,
    ...rtlText,
  },
  loadingCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyText: {
    textAlign: "center",
    color: palette.textSecondary,
    marginTop: 10,
    fontSize: 14,
    ...rtlText,
  },
  historyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 10,
  },
  historyTop: {
    flexDirection: row,
    alignItems: "flex-start",
    gap: 10,
  },
  historyMessage: {
    flex: 1,
    fontSize: 14,
    color: palette.textPrimary,
    lineHeight: 22,
    ...rtlText,
  },
  historyBadge: {
    backgroundColor: palette.softGold,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8D6E63",
    ...rtlText,
  },
  historyMeta: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  historyDate: {
    fontSize: 11,
    color: palette.textSecondary,
    ...rtlText,
  },
  historyAck: {
    fontSize: 11,
    color: colors.primary,
    ...rtlText,
  },
});