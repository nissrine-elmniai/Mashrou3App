import React, { useCallback, useEffect, useState } from "react";
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
import { Menu, Bell, Megaphone } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { rtlText, row } from "../../constants/rtl";
import { sendAlert, getAllAlertsAdmin } from "../../lib/alertsApi";

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

export default function AdminNotificationsScreen({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "notifications");
  const { currentUser, stats } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const [alertText, setAlertText] = useState("");
  const [toMembers, setToMembers] = useState(true);
  const [toSupervisors, setToSupervisors] = useState(true);
  const [sending, setSending] = useState(false);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  const loadHistory = useCallback(async () => {
    const res = await getAllAlertsAdmin();
    if (res.ok) setHistory(res.alerts);
    setLoadingHistory(false);
  }, []);

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

  const handleSend = async () => {
    const audience = resolveAudience();
    if (!audience) {
      Alert.alert("تنبيه", "اختر الأعضاء أو المشرفين أو الاثنين معاً");
      return;
    }
    if (!alertText.trim()) {
      Alert.alert("تنبيه", "اكتب نص التنبيه أولاً");
      return;
    }
    setSending(true);
    const result = await sendAlert(alertText.trim(), audience);
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
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
          {pendingCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {pendingCount > 9 ? "9+" : pendingCount}
              </Text>
            </View>
          ) : null}
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
                color={palette.primary}
                pointerEvents="none"
              />
              <Text style={styles.composerTitle}>إرسال تنبيه عاجل</Text>
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
            <View style={styles.audienceRow}>
              <TouchableOpacity
                style={[
                  styles.chip,
                  toMembers && styles.chipActive,
                ]}
                onPress={() => setToMembers((v) => !v)}
              >
                <Text
                  style={[
                    styles.chipText,
                    toMembers && styles.chipTextActive,
                  ]}
                >
                  الأعضاء
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.chip,
                  toSupervisors && styles.chipActive,
                ]}
                onPress={() => setToSupervisors((v) => !v)}
              >
                <Text
                  style={[
                    styles.chipText,
                    toSupervisors && styles.chipTextActive,
                  ]}
                >
                  المشرفون
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending}
              activeOpacity={0.85}
            >
              <Text style={styles.sendBtnText}>
                {sending ? "جارٍ الإرسال…" : "إرسال التنبيه"}
              </Text>
            </TouchableOpacity>
            <Text style={styles.composerHint}>
              سيظهر التنبيه في شاشة كاملة عاجلة لكل المستهدفين، ويبقى
              معروضاً حتى القراءة.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>سجل التنبيهات</Text>

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
  audienceRow: {
    flexDirection: row,
    gap: 10,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#EEEEEE",
  },
  chipActive: {
    backgroundColor: palette.softGreen,
    borderWidth: 1,
    borderColor: palette.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.textSecondary,
    ...rtlText,
  },
  chipTextActive: {
    color: palette.primary,
  },
  sendBtn: {
    marginTop: 14,
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    ...rtlText,
  },
  composerHint: {
    marginTop: 10,
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 12,
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
    color: palette.blue,
    ...rtlText,
  },
});