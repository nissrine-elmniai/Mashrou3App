import React, { useMemo, useState } from "react";
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
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell, Send, Megaphone } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { rtlText, row, textAlignStart } from "../../constants/rtl";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
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
  const {
    currentUser,
    stats,
    notifications,
    sendAlert,
    getNotificationsForUser,
    markNotificationRead,
  } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const [alertText, setAlertText] = useState("");
  const [toMembers, setToMembers] = useState(true);
  const [toSupervisors, setToSupervisors] = useState(true);
  const [sending, setSending] = useState(false);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  const list = useMemo(() => {
    const mine = getNotificationsForUser(currentUser);
    // Admin voit aussi tout ce qui a été diffusé
    const all = notifications.length ? notifications : mine;
    return [...all].sort((a, b) =>
      (a.createdAt || "") < (b.createdAt || "") ? 1 : -1
    );
  }, [notifications, currentUser, getNotificationsForUser]);

  const resolveAudience = () => {
    if (toMembers && toSupervisors) return "all";
    if (toMembers) return "members";
    if (toSupervisors) return "supervisors";
    return null;
  };

  const handleSend = () => {
    const audience = resolveAudience();
    if (!audience) {
      Alert.alert("تنبيه", "اختر الأعضاء أو المشرفين أو الاثنين معاً");
      return;
    }
    setSending(true);
    const result = sendAlert(alertText, audience);
    setSending(false);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
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
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
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
        <TouchableOpacity hitSlop={12}>
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
        >
        {pendingCount > 0 ? (
          <TouchableOpacity
            style={styles.pendingCard}
            onPress={() => navigation.navigate("AdminRegistrations")}
            activeOpacity={0.85}
          >
            <View style={styles.pendingIcon}>
              <Megaphone size={20} color={palette.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>طلبات تسجيل معلّقة</Text>
              <Text style={styles.pendingSub}>
                {pendingCount} طلب بانتظار مراجعتك
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>إرسال تنبيه جديد</Text>
          <Text style={styles.sectionSub}>اختر المستلمين ثم اكتب نص التنبيه</Text>

          <View style={styles.audienceRow}>
            <Text style={styles.audienceLabel}>إرسال إلى</Text>
            <TouchableOpacity
              style={[styles.audienceChip, toMembers && styles.audienceChipActive]}
              onPress={() => setToMembers((v) => !v)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.audienceChipText,
                  toMembers && styles.audienceChipTextActive,
                ]}
              >
                الأعضاء
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.audienceChip,
                toSupervisors && styles.audienceChipActive,
              ]}
              onPress={() => setToSupervisors((v) => !v)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.audienceChipText,
                  toSupervisors && styles.audienceChipTextActive,
                ]}
              >
                المشرفون
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="اكتب نص التنبيه هنا..."
            placeholderTextColor={palette.placeholder}
            value={alertText}
            onChangeText={setAlertText}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            textAlign={textAlignStart}
          />
          <TouchableOpacity
            style={[styles.sendBtn, sending && { opacity: 0.6 }]}
            onPress={sending ? undefined : handleSend}
            activeOpacity={0.85}
          >
            <Send size={18} color="#fff" />
            <Text style={styles.sendBtnText}>
              {sending ? "جاري الإرسال..." : "إرسال التنبيه"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.listHeading}>سجل التنبيهات</Text>

        {list.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>لا توجد تنبيهات بعد</Text>
          </View>
        ) : (
          list.map((n) => {
            const unread =
              currentUser?.id && !(n.readBy || []).includes(currentUser.id);
            return (
              <TouchableOpacity
                key={n.id}
                style={[styles.notifCard, unread && styles.notifCardUnread]}
                onPress={() => markNotificationRead(n.id)}
                activeOpacity={0.85}
              >
                <View
                  style={[
                    styles.notifDot,
                    { backgroundColor: unread ? palette.primary : palette.border },
                  ]}
                />
                <View style={styles.notifBody}>
                  <View style={styles.notifTitleRow}>
                    <Text style={styles.notifTitle}>{n.title}</Text>
                    {AUDIENCE_LABELS[n.audience] ? (
                      <View style={styles.audienceBadge}>
                        <Text style={styles.audienceBadgeText}>
                          {AUDIENCE_LABELS[n.audience]}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.notifText}>{n.body}</Text>
                  <Text style={styles.notifTime}>{formatTime(n.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  pendingCard: {
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pendingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  pendingTitle: {
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 14,
    ...rtlText,
  },
  pendingSub: {
    color: palette.textSecondary,
    fontSize: 13,
    marginTop: 2,
    ...rtlText,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    marginBottom: 4,
    ...rtlText,
  },
  sectionSub: {
    color: palette.placeholder,
    fontSize: 13,
    marginBottom: 12,
    ...rtlText,
  },
  audienceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.textSecondary,
    ...rtlText,
  },
  audienceRow: {
    flexDirection: row,
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  audienceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
  },
  audienceChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  audienceChipText: {
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  audienceChipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 100,
    backgroundColor: palette.background,
    fontSize: 15,
    color: palette.textPrimary,
    marginBottom: 12,
    ...rtlText,
  },
  sendBtn: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  sendBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    ...rtlText,
  },
  listHeading: {
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    marginBottom: 12,
    ...rtlText,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    color: palette.textSecondary,
    ...rtlText,
  },
  notifCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: row,
    alignItems: "flex-start",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  notifCardUnread: {
    borderRightWidth: 3,
    borderRightColor: palette.primary,
  },
  notifDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  notifBody: {
    flex: 1,
  },
  notifTitleRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  notifTitle: {
    flex: 1,
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 14,
    ...rtlText,
  },
  audienceBadge: {
    backgroundColor: palette.softGreen,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  audienceBadgeText: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: "600",
    ...rtlText,
  },
  notifText: {
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    ...rtlText,
  },
  notifTime: {
    color: palette.placeholder,
    fontSize: 11,
    marginTop: 6,
    ...rtlText,
  },
});
