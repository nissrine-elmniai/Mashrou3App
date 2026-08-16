import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Menu,
  X,
  Home,
  Users,
  UserCog,
  Calendar,
  ClipboardList,
  FileText,
  Bell,
  MessageSquare,
  Settings,
  LogOut,
  Plus,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import {
  ROLES,
  userHasRole,
  REGISTRATION_STATUS,
  ACCOUNT_STATUS,
} from "../../constants/roles";
import { rtlText, row, isRTL } from "../../constants/rtl";

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

const SIDEBAR_WIDTH = 280;

function parseActivityDate(value) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  const raw = String(value).trim();
  if (!raw) return null;
  // ISO
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;
  // YYYY/MM/DD or DD/MM/YYYY
  const parts = raw.split(/[/-]/).map(Number);
  if (parts.length === 3 && parts.every((n) => n > 0)) {
    if (parts[0] > 31) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    if (parts[2] > 31) {
      return new Date(parts[2], parts[1] - 1, parts[0]);
    }
  }
  return null;
}

function formatRelativeTime(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "الآن";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "منذ يوم";
  if (days < 7) return `منذ ${days} أيام`;
  return date.toLocaleDateString("ar-MA", {
    day: "numeric",
    month: "short",
  });
}

function buildRecentActivities({
  registrations = [],
  exams = [],
  users = [],
  notifications = [],
}) {
  const items = [];

  registrations.forEach((r) => {
    const name = r.fullName || r.email || "مترشح";
    if (r.status === REGISTRATION_STATUS.PENDING) {
      items.push({
        id: `reg-pending-${r.id}`,
        color: palette.gold,
        text: `طلب تسجيل جديد: ${name}`,
        at: parseActivityDate(r.createdAt) || new Date(0),
      });
    } else if (
      r.status === REGISTRATION_STATUS.INVITED ||
      r.status === REGISTRATION_STATUS.ACCEPTED
    ) {
      items.push({
        id: `reg-accepted-${r.id}`,
        color: palette.primary,
        text: `تم قبول طلب: ${name}`,
        at:
          parseActivityDate(r.acceptedAt) ||
          parseActivityDate(r.createdAt) ||
          new Date(0),
      });
    } else if (r.status === REGISTRATION_STATUS.ACTIVATED) {
      items.push({
        id: `reg-activated-${r.id}`,
        color: palette.primary,
        text: `تم إنشاء حساب العضو: ${name}`,
        at:
          parseActivityDate(r.acceptedAt) ||
          parseActivityDate(r.createdAt) ||
          new Date(0),
      });
    } else if (r.status === REGISTRATION_STATUS.REJECTED) {
      items.push({
        id: `reg-rejected-${r.id}`,
        color: palette.red,
        text: `تم رفض طلب: ${name}`,
        at: parseActivityDate(r.createdAt) || new Date(0),
      });
    }
  });

  exams.forEach((e) => {
    const title = e.title || "اختبار";
    if (e.status === "cancelled") {
      items.push({
        id: `exam-cancel-${e.id}`,
        color: palette.red,
        text: `تم إلغاء الاختبار: ${title}`,
        at: parseActivityDate(e.createdAt) || parseActivityDate(e.date) || new Date(0),
      });
    } else if (e.status === "completed") {
      items.push({
        id: `exam-done-${e.id}`,
        color: palette.blue,
        text: `تم إنجاز الاختبار: ${title}`,
        at: parseActivityDate(e.createdAt) || parseActivityDate(e.date) || new Date(0),
      });
    } else {
      items.push({
        id: `exam-${e.id}`,
        color: palette.blue,
        text: `اختبار جديد: ${title}`,
        at: parseActivityDate(e.createdAt) || parseActivityDate(e.date) || new Date(0),
      });
    }
  });

  users.forEach((u) => {
    if (!userHasRole(u, ROLES.SUPERVISOR)) return;
    if (u.accountStatus !== ACCOUNT_STATUS.INVITED) return;
    const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
    items.push({
      id: `sup-invite-${u.id}`,
      color: palette.gold,
      text: `تعيين مشرف جديد: ${name}`,
      at: parseActivityDate(u.createdAt) || new Date(0),
    });
  });

  notifications.forEach((n) => {
    const title = String(n.title || "");
    if (!title.includes("تنبيه")) return;
    items.push({
      id: `notif-${n.id}`,
      color: palette.red,
      text: n.body ? `${title}: ${n.body}` : title,
      at: parseActivityDate(n.createdAt) || new Date(0),
    });
  });

  return items
    .sort((a, b) => b.at - a.at)
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      color: item.color,
      text: item.text,
      time: formatRelativeTime(item.at),
    }));
}

function DashboardHome({ navigation, stats, activities }) {
  const statCards = [
    { label: "الأعضاء", value: stats?.members ?? 0, icon: "👥" },
    { label: "المشرفون", value: stats?.supervisors ?? 0, icon: "👨\u200d🏫" },
    { label: "الحصص", value: stats?.groups ?? 0, icon: "📅" },
    {
      label: "الاختبارات",
      value: stats?.exams ?? 0,
      icon: "📋",
      badge: stats?.pendingRegs > 0 ? `${stats.pendingRegs} معلق` : null,
    },
  ];

  return (
    <View style={dhStyles.wrapper}>
      <View style={dhStyles.statsGrid}>
        {statCards.map((stat, index) => (
          <View key={index} style={dhStyles.statCard}>
            <Text style={dhStyles.statValue}>{stat.value}</Text>
            <Text style={dhStyles.statLabel}>
              {stat.icon}  {stat.label}
            </Text>
            {stat.badge ? (
              <View style={dhStyles.statBadge}>
                <Text style={dhStyles.statBadgeText}>{stat.badge}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={dhStyles.actionsScroll}
        contentContainerStyle={dhStyles.actionsContent}
      >
        <TouchableOpacity
          style={[dhStyles.actionBtn, { backgroundColor: palette.gold }]}
          onPress={() => navigation.navigate("AdminSupervisors")}
        >
          <Plus size={16} color={palette.textPrimary} />
          <Text style={[dhStyles.actionBtnText, { color: palette.textPrimary }]}>إضافة مشرف</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[dhStyles.actionBtn, { backgroundColor: palette.primary }]}
          onPress={() =>
            navigation.navigate("AdminTests", { initialTab: "create" })
          }
        >
          <Plus size={16} color="#fff" />
          <Text style={[dhStyles.actionBtnText, { color: "#fff" }]}>إنشاء اختبار</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[dhStyles.actionBtn, dhStyles.actionBtnOutline]}
          onPress={() => navigation.navigate("AdminNotifications")}
        >
          <Plus size={16} color={palette.textSecondary} />
          <Text style={[dhStyles.actionBtnText, { color: palette.textSecondary }]}>إشعار</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={dhStyles.activityCard}>
        <Text style={dhStyles.activityTitle}>النشاط الأخير</Text>
        {activities.length === 0 ? (
          <Text style={dhStyles.activityEmpty}>لا يوجد نشاط بعد</Text>
        ) : (
          activities.map((activity) => (
            <View key={activity.id} style={dhStyles.activityItem}>
              <View
                style={[
                  dhStyles.activityDot,
                  { backgroundColor: activity.color },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={dhStyles.activityText}>{activity.text}</Text>
                {activity.time ? (
                  <Text style={dhStyles.activityTime}>{activity.time}</Text>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function AdminSidebar({ isOpen, onClose, navigation, currentUser, onLogout }) {
  const translateX = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: SIDEBAR_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen]);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "محمد أحمد";
  const initial = displayName.charAt(0) || "م";

  const menuItems = [
    { id: "home", label: "الرئيسية", icon: Home },
    { id: "supervisors", label: "المشرفون", icon: UserCog },
    { id: "members", label: "الأعضاء", icon: Users },
    { id: "registrations", label: "طلبات التسجيل", icon: FileText },
    { id: "sessions", label: "الحصص", icon: Calendar },
    { id: "tests", label: "الاختبارات", icon: ClipboardList },
    { id: "notifications", label: "التنبيهات", icon: Bell },
    { id: "chat", label: "الدردشة", icon: MessageSquare },
    { id: "settings", label: "الإعدادات", icon: Settings },
  ];

  const routeMap = {
    supervisors: "AdminSupervisors",
    members: "AdminMembers",
    registrations: "AdminRegistrations",
    sessions: "AdminSeasons",
    tests: "AdminTests",
    notifications: "AdminNotifications",
    chat: "AdminChat",
    settings: "AdminSettings",
  };

  const handlePress = (id) => {
    if (id === "home") {
      onClose();
      return;
    }
    onClose();
    if (routeMap[id]) {
      navigation.navigate(routeMap[id]);
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="none" onRequestClose={onClose}>
      <View style={sbStyles.modalContainer}>
        <Animated.View
          style={[
            sbStyles.overlay,
            { opacity: overlayOpacity },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          style={[
            sbStyles.sidebar,
            isRTL ? { left: 0 } : { right: 0 },
            {
              top: insets.top,
              // Au moins 16px en bas (souvent insets.bottom = 0 sur Android)
              bottom: Math.max(insets.bottom, 16),
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={sbStyles.header}>
            <View style={sbStyles.avatar}>
              <Text style={sbStyles.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={sbStyles.role}>مشرف عام</Text>
              <Text style={sbStyles.name}>{displayName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={sbStyles.menuScroll}
            contentContainerStyle={sbStyles.menuList}
            showsVerticalScrollIndicator={false}
          >
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === "home";
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handlePress(item.id)}
                  style={[
                    sbStyles.menuItem,
                    isActive && sbStyles.menuItemActive,
                  ]}
                >
                  <Icon
                    size={20}
                    color={isActive ? palette.primary : palette.textSecondary}
                    pointerEvents="none"
                  />
                  <Text
                    style={[
                      sbStyles.menuItemText,
                      isActive && sbStyles.menuItemTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={sbStyles.logoutWrap}>
            <TouchableOpacity
              style={sbStyles.logoutBtn}
              onPress={onLogout}
              activeOpacity={0.7}
            >
              <LogOut size={20} color={palette.red} pointerEvents="none" />
              <Text style={sbStyles.logoutText}>تسجيل الخروج</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function AdminDashboard({ navigation }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    stats,
    logout,
    currentUser,
    users,
    exams,
    seasons,
    registrations,
    notifications,
  } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const derivedStats = {
    members:
      stats?.members ??
      users.filter((u) => userHasRole(u, ROLES.MEMBER)).length,
    supervisors:
      stats?.supervisors ??
      users.filter((u) => userHasRole(u, ROLES.SUPERVISOR)).length,
    groups: stats?.groups ?? seasons?.length ?? 0,
    exams: stats?.exams ?? exams?.length ?? 0,
    pendingRegs: stats?.pendingRegs ?? 0,
  };

  const recentActivities = useMemo(
    () =>
      buildRecentActivities({
        registrations,
        exams,
        users,
        notifications,
      }),
    [registrations, exams, users, notifications]
  );

  const handleLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => setSidebarOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>لوحة التحكم</Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="الملف الشخصي"
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="التنبيهات"
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
          {derivedStats.pendingRegs > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {derivedStats.pendingRegs > 9 ? "9+" : derivedStats.pendingRegs}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + bottomGap }]}
        showsVerticalScrollIndicator={false}
      >
        <DashboardHome
          navigation={navigation}
          stats={derivedStats}
          activities={recentActivities}
        />
      </ScrollView>

      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        navigation={navigation}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
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
    right: -4,
    width: 16,
    height: 16,
    backgroundColor: palette.red,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
});

const sbStyles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sidebar: {
    position: "absolute",
    width: SIDEBAR_WIDTH,
    backgroundColor: "#fff",
    elevation: 10,
    zIndex: 2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  header: {
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 18,
  },
  role: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    ...rtlText,
  },
  name: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    ...rtlText,
  },
  menuScroll: {
    flex: 1,
  },
  menuList: {
    padding: 8,
    paddingBottom: 16,
  },
  menuItem: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  menuItemActive: {
    backgroundColor: palette.softGreen,
    borderRightWidth: 3,
    borderRightColor: palette.primary,
  },
  menuItemText: {
    fontWeight: "500",
    color: palette.textSecondary,
    fontSize: 14,
    ...rtlText,
  },
  menuItemTextActive: {
    color: palette.primary,
  },
  logoutWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: "#fff",
  },
  logoutBtn: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: "#FFEBEE",
    borderRadius: 12,
  },
  logoutText: {
    color: palette.red,
    fontWeight: "600",
    ...rtlText,
  },
});

const dhStyles = StyleSheet.create({
  wrapper: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: palette.primary,
    marginBottom: 4,
  },
  statLabel: {
    color: palette.textSecondary,
    fontSize: 14,
    ...rtlText,
  },
  statBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: palette.gold,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statBadgeText: {
    fontSize: 12,
    color: palette.textPrimary,
  },
  actionsScroll: {
    flexGrow: 0,
    marginBottom: 24,
  },
  actionsContent: {
    flexDirection: row,
    gap: 8,
  },
  actionBtn: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  actionBtnOutline: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: "transparent",
  },
  actionBtnText: {
    fontWeight: "600",
    fontSize: 14,
    ...rtlText,
  },
  activityCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  activityTitle: {
    fontWeight: "bold",
    color: palette.textPrimary,
    marginBottom: 12,
    fontSize: 16,
    ...rtlText,
  },
  activityItem: {
    flexDirection: row,
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  activityText: {
    color: palette.textPrimary,
    fontSize: 14,
    ...rtlText,
  },
  activityTime: {
    color: palette.placeholder,
    fontSize: 12,
    ...rtlText,
  },
  activityEmpty: {
    color: palette.textSecondary,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
    ...rtlText,
  },
});
