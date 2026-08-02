import React from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, LogOut, Mail, Shield, User, CheckCircle } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { ROLE_LABELS } from "../../constants/roles";
import { rtlText, row, isRTL } from "../../constants/rtl";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
};

export default function AdminProfileScreen({ navigation }) {
  const { currentUser, logout } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const fullName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = (currentUser?.firstName || fullName || "م").charAt(0);
  const statusLabel =
    currentUser?.accountStatus === "active" || !currentUser?.accountStatus
      ? "نشط"
      : currentUser.accountStatus;

  const handleLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const infoRows = [
    {
      label: "الاسم الكامل",
      value: fullName || "—",
      icon: User,
    },
    {
      label: "البريد",
      value: currentUser?.email || "—",
      icon: Mail,
    },
    {
      label: "الدور",
      value: ROLE_LABELS[currentUser?.role] || "مشرف عام",
      icon: Shield,
    },
    {
      label: "حالة الحساب",
      value: statusLabel,
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
        <View style={styles.topBarAvatar}>
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + bottomGap }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.userName}>{fullName || "المسؤول"}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {ROLE_LABELS[currentUser?.role] || "مشرف عام"}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>المعلومات الشخصية</Text>
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

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>الحساب</Text>
          <Text style={styles.sectionSub}>إدارة حسابك</Text>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <LogOut size={20} color={palette.red} />
            <Text style={styles.logoutText}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  logoutBtn: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    backgroundColor: "#FFEBEE",
    borderRadius: 12,
  },
  logoutText: {
    color: palette.red,
    fontWeight: "600",
    fontSize: 15,
    ...rtlText,
  },
});
