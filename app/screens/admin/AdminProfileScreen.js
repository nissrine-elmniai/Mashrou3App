import React, { useCallback, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  ArrowRight,
  Mail,
  Shield,
  User,
  CheckCircle,
  Phone,
  Settings,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { ROLE_LABELS, formatAccountStatusLabel } from "../../constants/roles";
import { rtlText, row, isRTL } from "../../constants/rtl";
import EditableAvatar from "../../components/EditableAvatar";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";
import ProfileCardHeader from "../../components/profile/ProfileCardHeader";
import EditAdminProfileModal from "../../components/profile/EditAdminProfileModal";
import { PROFILE_COLUMN_LABELS as L } from "../../components/profile/profileColumnLabels";

const palette = {
  primary: "#2E7D32",
  softGreen: "#E8F5E9",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
};

export default function AdminProfileScreen({ navigation }) {
  const {
    currentUser,
    updateCurrentUserAvatar,
    updateCurrentUserProfile,
    refreshCurrentUser,
  } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);
  const [editModal, setEditModal] = useState(false);
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

  const fullName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = (currentUser?.firstName || fullName || "م").charAt(0);
  const roleLabel = ROLE_LABELS[currentUser?.role] || "—";
  const phoneLabel = String(currentUser?.phone || "").trim() || "—";
  const authId = currentUser?.authId || null;

  const handleProfileSaved = (savedProfile) => {
    updateCurrentUserProfile({
      firstName: savedProfile?.first_name ?? currentUser?.firstName,
      lastName: savedProfile?.last_name ?? currentUser?.lastName,
      phone: savedProfile?.phone ?? currentUser?.phone ?? null,
    });
    refreshRef.current?.();
  };

  const infoRows = [
    {
      label: L.full_name,
      value: fullName || "—",
      icon: User,
    },
    {
      label: L.email,
      value: currentUser?.email || "—",
      icon: Mail,
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
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <ArrowRight
            size={24}
            color={palette.textPrimary}
            style={!isRTL ? { transform: [{ scaleX: -1 }] } : null}
          />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>الملف الشخصي</Text>
        <AdminTopBarAvatar currentUser={currentUser} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + bottomGap }]}
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
          <Text style={styles.sectionSub}>معلومات ملفك الشخصي</Text>

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

        <TouchableOpacity
          style={styles.settingsRow}
          onPress={() => navigation.navigate("AdminSettings")}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="إعدادات الحساب"
        >
          <View style={styles.infoIcon}>
            <Settings size={18} color={palette.primary} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.actionTitle}>إعدادات الحساب</Text>
            <Text style={styles.actionSub}>البريد الإلكتروني، كلمة المرور</Text>
          </View>
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
  settingsRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
});
