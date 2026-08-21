import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Menu,
  Bell,
  Mail,
  Lock,
  LogOut,
  User,
  Shield,
  X,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { ROLE_LABELS } from "../../constants/roles";
import { rtlText, row, textAlignStart } from "../../constants/rtl";
import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "../../lib/supabase";
import { upsertProfile } from "../../lib/auth";

const palette = {
  primary: "#2E7D32",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  softRed: "#FFEBEE",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
};

export default function AdminSettingsScreen({ navigation }) {
  const { openSidebar, sidebar } = useAdminSidebar(navigation, "settings");
  const { currentUser, stats, logout } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const [emailModal, setEmailModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج من الحساب؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await logout();
          navigation.reset({ index: 0, routes: [{ name: "Login" }] });
        },
      },
    ]);
  };

  const openEmailModal = () => {
    setNewEmail(currentUser?.email || "");
    setEmailModal(true);
  };

  const openPasswordModal = () => {
    setNewPassword("");
    setConfirmPassword("");
    setPasswordModal(true);
  };

  const saveEmail = async () => {
    const mail = String(newEmail || "").trim().toLowerCase();
    if (!mail || !mail.includes("@")) {
      Alert.alert("تنبيه", "أدخل بريداً إلكترونياً صالحاً");
      return;
    }
    if (mail === (currentUser?.email || "").toLowerCase()) {
      setEmailModal(false);
      return;
    }

    setSaving(true);
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.updateUser({ email: mail });
        if (error) {
          Alert.alert(
            "خطأ",
            mapSupabaseAuthError(error) ||
              "تعذر تغيير البريد. تحقق من إعدادات إرسال البريد في Supabase."
          );
          return;
        }
        if (data?.user?.id) {
          await upsertProfile({
            id: data.user.id,
            email: mail,
            role: currentUser?.role,
            firstName: currentUser?.firstName,
            lastName: currentUser?.lastName,
          });
        }
        Alert.alert(
          "تم",
          "تم طلب تغيير البريد. قد تحتاج إلى تأكيد البريد الجديد من صندوق الوارد."
        );
      } else {
        Alert.alert(
          "تنبيه",
          "Supabase غير مفعّل — لا يمكن تغيير البريد حالياً."
        );
        return;
      }
      setEmailModal(false);
    } catch (e) {
      Alert.alert("خطأ", mapSupabaseAuthError(e) || "تعذر تحديث البريد");
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("تنبيه", "كلمة المرور قصيرة جداً (6 أحرف على الأقل)");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("تنبيه", "كلمة المرور غير متطابقة");
      return;
    }

    setSaving(true);
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (error) {
          Alert.alert("خطأ", mapSupabaseAuthError(error));
          return;
        }
        Alert.alert("تم", "تم تغيير كلمة المرور بنجاح");
      } else {
        Alert.alert(
          "تنبيه",
          "Supabase غير مفعّل — لا يمكن تغيير كلمة المرور حالياً."
        );
        return;
      }
      setPasswordModal(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      Alert.alert("خطأ", mapSupabaseAuthError(e) || "تعذر تحديث كلمة المرور");
    } finally {
      setSaving(false);
    }
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
        <Text style={styles.topBarTitle}>الإعدادات</Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + bottomGap },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.userName}>{displayName || "المسؤول"}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {ROLE_LABELS[currentUser?.role] || "مشرف عام"}
            </Text>
          </View>
          <Text style={styles.emailHint}>{currentUser?.email || "—"}</Text>
        </View>

        <Text style={styles.sectionLabel}>معلومات الحساب</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <User size={18} color={palette.primary} />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>الاسم</Text>
              <Text style={styles.infoValue}>{displayName || "—"}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Shield size={18} color={palette.primary} />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>الدور</Text>
              <Text style={styles.infoValue}>
                {ROLE_LABELS[currentUser?.role] || "مشرف عام"}
              </Text>
            </View>
          </View>
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <View style={styles.infoIcon}>
              <Mail size={18} color={palette.primary} />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>البريد الحالي</Text>
              <Text style={styles.infoValue}>{currentUser?.email || "—"}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>إدارة الحساب</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={openEmailModal}>
            <View style={styles.infoIcon}>
              <Mail size={18} color={palette.primary} />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.actionTitle}>تغيير البريد الإلكتروني</Text>
              <Text style={styles.actionSub}>تحديث بريد تسجيل الدخول</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionRow, styles.infoRowLast]}
            onPress={openPasswordModal}
          >
            <View style={styles.infoIcon}>
              <Lock size={18} color={palette.primary} />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.actionTitle}>تغيير كلمة المرور</Text>
              <Text style={styles.actionSub}>تعيين كلمة مرور جديدة</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.75}
        >
          <LogOut size={20} color={palette.red} />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={emailModal}
        transparent
        animationType="slide"
        onRequestClose={() => setEmailModal(false)}
      >
        <View style={[styles.modalOverlay, { paddingBottom: bottomGap }]}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تغيير البريد</Text>
              <TouchableOpacity onPress={() => setEmailModal(false)} hitSlop={10}>
                <X size={22} color={palette.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>البريد الجديد</Text>
            <TextInput
              style={styles.input}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="email@example.com"
              placeholderTextColor={palette.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              textAlign={textAlignStart}
            />
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={saving ? undefined : saveEmail}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>حفظ</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={passwordModal}
        transparent
        animationType="slide"
        onRequestClose={() => setPasswordModal(false)}
      >
        <View style={[styles.modalOverlay, { paddingBottom: bottomGap }]}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تغيير كلمة المرور</Text>
              <TouchableOpacity
                onPress={() => setPasswordModal(false)}
                hitSlop={10}
              >
                <X size={22} color={palette.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>كلمة المرور الجديدة</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="••••••••"
              placeholderTextColor={palette.placeholder}
              secureTextEntry
              textAlign={textAlignStart}
            />
            <Text style={styles.modalLabel}>تأكيد كلمة المرور</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              placeholderTextColor={palette.placeholder}
              secureTextEntry
              textAlign={textAlignStart}
            />
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={saving ? undefined : savePassword}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>حفظ</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  scrollContent: { padding: 16 },
  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.softGreen,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: {
    color: palette.primary,
    fontSize: 28,
    fontWeight: "bold",
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
    color: palette.textPrimary,
    marginBottom: 8,
    ...rtlText,
  },
  badge: {
    backgroundColor: palette.softGreen,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 8,
  },
  badgeText: {
    color: palette.primary,
    fontWeight: "600",
    fontSize: 12,
    ...rtlText,
  },
  emailHint: {
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.textSecondary,
    marginBottom: 8,
    ...rtlText,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  infoRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.softGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  infoText: { flex: 1 },
  infoLabel: {
    fontSize: 12,
    color: palette.placeholder,
    marginBottom: 2,
    ...rtlText,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: palette.textPrimary,
    ...rtlText,
  },
  actionRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: palette.textPrimary,
    ...rtlText,
  },
  actionSub: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 2,
    ...rtlText,
  },
  logoutBtn: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: palette.softRed,
    borderRadius: 14,
    marginTop: 4,
  },
  logoutText: {
    color: palette.red,
    fontWeight: "700",
    fontSize: 15,
    ...rtlText,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: palette.textPrimary,
    ...rtlText,
  },
  modalLabel: {
    fontSize: 13,
    color: palette.textSecondary,
    marginBottom: 6,
    ...rtlText,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: palette.background,
    fontSize: 15,
    color: palette.textPrimary,
    marginBottom: 14,
    ...rtlText,
  },
  saveBtn: {
    backgroundColor: palette.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    ...rtlText,
  },
});
