import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  Menu,
  Bell,
  Mail,
  Shield,
  User,
  CheckCircle,
  Phone,
  Lock,
  LogOut,
  X,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { ROLE_LABELS, formatAccountStatusLabel } from "../../constants/roles";
import { rtlText, row, textAlignStart } from "../../constants/rtl";
import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "../../lib/supabase";
import EditableAvatar from "../../components/EditableAvatar";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";
import ProfileCardHeader from "../../components/profile/ProfileCardHeader";
import EditAdminProfileModal from "../../components/profile/EditAdminProfileModal";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import { PROFILE_COLUMN_LABELS as L } from "../../components/profile/profileColumnLabels";

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

export default function AdminProfileScreen({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(
    navigation,
    "profile"
  );
  const {
    currentUser,
    stats,
    logout,
    updateCurrentUserAvatar,
    updateCurrentUserProfile,
    refreshCurrentUser,
  } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);
  const [editModal, setEditModal] = useState(false);
  const [emailModal, setEmailModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const refreshRef = useRef(refreshCurrentUser);
  refreshRef.current = refreshCurrentUser;
  const refreshInFlightRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (refreshInFlightRef.current) return undefined;
      refreshInFlightRef.current = true;
      (async () => {
        try {
          await refreshRef.current();
        } catch {
          /* garder les données affichées */
        } finally {
          refreshInFlightRef.current = false;
        }
      })();
      return undefined;
    }, [])
  );

  useEffect(() => {
    if (!emailModal) {
      setKeyboardHeight(0);
      return undefined;
    }
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [emailModal]);

  const fullName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = (currentUser?.firstName || fullName || "م").charAt(0);
  const roleLabel = ROLE_LABELS[currentUser?.role] || "—";
  const phoneLabel = String(currentUser?.phone || "").trim() || "—";
  const authId = currentUser?.authId || null;
  const pendingCount = stats?.pendingRegs ?? 0;
  const modalBottomPad = keyboardHeight > 0 ? keyboardHeight : bottomGap;

  const handleProfileSaved = (savedProfile) => {
    updateCurrentUserProfile({
      firstName: savedProfile?.first_name ?? currentUser?.firstName,
      lastName: savedProfile?.last_name ?? currentUser?.lastName,
      phone: savedProfile?.phone ?? currentUser?.phone ?? null,
    });
    refreshRef.current?.();
  };

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

  const closeEmailModal = () => {
    Keyboard.dismiss();
    setEmailModal(false);
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
      if (!isSupabaseConfigured()) {
        Alert.alert(
          "تنبيه",
          "Supabase غير مفعّل — لا يمكن تغيير البريد حالياً."
        );
        return;
      }
      // Demande Auth uniquement : profiles.email n'est pas à jour tant que
      // l'utilisateur n'a pas confirmé le nouveau courriel.
      const { error } = await supabase.auth.updateUser({ email: mail });
      if (error) {
        Alert.alert(
          "خطأ",
          mapSupabaseAuthError(error) ||
            "تعذر تغيير البريد. تحقق من إعدادات إرسال البريد في Supabase."
        );
        return;
      }
      Alert.alert(
        "تم",
        "تم إرسال طلب تغيير البريد. يصبح العنوان الجديد فعّالاً بعد تأكيدك من صندوق الوارد."
      );
      setEmailModal(false);
    } catch (e) {
      Alert.alert("خطأ", mapSupabaseAuthError(e) || "تعذر تحديث البريد");
    } finally {
      setSaving(false);
    }
  };

  const infoRows = [
    {
      label: L.full_name,
      value: fullName || "—",
      icon: User,
    },
    {
      label: L.phone,
      value: phoneLabel,
      icon: Phone,
    },
    {
      label: L.role,
      value: roleLabel,
      icon: Shield,
    },
    {
      label: L.account_status,
      value: formatAccountStatusLabel(currentUser?.accountStatus),
      icon: CheckCircle,
    },
  ];

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
        <Text style={styles.topBarTitle}>الملف الشخصي</Text>
        <AdminTopBarAvatar currentUser={currentUser} />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="التنبيهات"
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
          <EditableAvatar
            authId={currentUser?.authId}
            avatarUrl={currentUser?.avatarUrl}
            fallbackLetter={initial}
            size={72}
            softBackgroundColor={palette.softGreen}
            letterColor={palette.primary}
            onChanged={updateCurrentUserAvatar}
          />
          <Text style={styles.userName}>{fullName || "المسؤول"}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{roleLabel}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <ProfileCardHeader
            title="المعلومات الشخصية"
            onAction={() => setEditModal(true)}
            accessibilityLabel="تعديل المعلومات الشخصية"
          />

          {infoRows.map((rowItem, index) => {
            const Icon = rowItem.icon;
            const isLast = index === infoRows.length - 1;
            return (
              <View
                key={rowItem.label}
                style={[styles.infoRow, isLast && styles.infoRowLast]}
              >
                <View style={styles.infoIcon}>
                  <Icon size={18} color={palette.primary} />
                </View>
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>{rowItem.label}</Text>
                  <Text style={styles.infoValue}>{rowItem.value}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>إدارة الحساب</Text>
        <View style={styles.accountCard}>
          <TouchableOpacity style={styles.actionRow} onPress={openEmailModal}>
            <View style={styles.infoIcon}>
              <Mail size={18} color={palette.primary} />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.actionTitle}>تغيير البريد الإلكتروني</Text>
              <Text style={styles.actionSub}>
                {currentUser?.email || "—"}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionRow, styles.actionRowLast]}
            onPress={() => setPasswordModal(true)}
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

      <EditAdminProfileModal
        visible={editModal}
        onClose={() => setEditModal(false)}
        onSaved={handleProfileSaved}
        authId={authId}
        firstName={currentUser?.firstName || ""}
        lastName={currentUser?.lastName || ""}
        phone={currentUser?.phone || ""}
        bottomInset={bottomGap}
      />

      <Modal
        visible={emailModal}
        transparent
        animationType="slide"
        onRequestClose={closeEmailModal}
      >
        <KeyboardAvoidingView
          style={styles.modalFlex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalOverlay, { paddingBottom: modalBottomPad }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeEmailModal} />
            <View style={styles.modalCard}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>تغيير البريد</Text>
                  <TouchableOpacity onPress={closeEmailModal} hitSlop={10}>
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
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ChangePasswordModal
        visible={passwordModal}
        onClose={() => setPasswordModal(false)}
        bottomInset={bottomGap}
      />
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
  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
  },
  badgeText: {
    color: palette.primary,
    fontWeight: "600",
    fontSize: 12,
    ...rtlText,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionSub: {
    color: palette.placeholder,
    fontSize: 13,
    marginBottom: 16,
    ...rtlText,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.textSecondary,
    marginBottom: 8,
    ...rtlText,
  },
  infoRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  infoRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.softGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  infoText: {
    flex: 1,
  },
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
  accountCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  actionRowLast: {
    borderBottomWidth: 0,
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
  modalFlex: { flex: 1 },
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
    maxHeight: "85%",
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
