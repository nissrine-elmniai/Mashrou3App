import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
} from "react-native";
import {
  Menu,
  X,
  Home,
  Users,
  UserCog,
  Calendar,
  ClipboardList,
  Bell,
  MessageSquare,
  Settings,
  LogOut,
  Plus,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { ROLES, userHasRole } from "../../constants/roles";
import { rtlText, row } from "../../constants/rtl";

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

function DashboardHome({ navigation, stats }) {
  const statCards = [
    { label: "الأعضاء", value: stats?.members ?? 0, icon: "👥" },
    { label: "المشرفون", value: stats?.supervisors ?? 0, icon: "👨\u200d🏫" },
    { label: "الجلسات", value: stats?.groups ?? 0, icon: "📅" },
    {
      label: "الاختبارات",
      value: stats?.exams ?? 0,
      icon: "📋",
      badge: stats?.pendingRegs > 0 ? `${stats.pendingRegs} معلق` : null,
    },
  ];

  const activities = [
    { color: palette.primary, text: "تم إضافة عضو جديد: أحمد محمد", time: "منذ 5 دقائق" },
    { color: palette.gold, text: "اختبار جديد معلق للمراجعة", time: "منذ 15 دقيقة" },
    { color: palette.blue, text: "تم تحديث بيانات الجلسة", time: "منذ ساعة" },
    { color: palette.red, text: "تنبيه: عضو متغيب 3 مرات متتالية", time: "منذ ساعتين" },
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
          onPress={() => navigation.navigate("AdminTests")}
        >
          <Plus size={16} color="#fff" />
          <Text style={[dhStyles.actionBtnText, { color: "#fff" }]}>إنشاء اختبار</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[dhStyles.actionBtn, dhStyles.actionBtnOutline]}
          onPress={() => navigation.navigate("AdminRegistrations")}
        >
          <Plus size={16} color={palette.textSecondary} />
          <Text style={[dhStyles.actionBtnText, { color: palette.textSecondary }]}>إشعار</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={dhStyles.activityCard}>
        <Text style={dhStyles.activityTitle}>النشاط الأخير</Text>
        {activities.map((activity, index) => (
          <View key={index} style={dhStyles.activityItem}>
            <View style={[dhStyles.activityDot, { backgroundColor: activity.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={dhStyles.activityText}>{activity.text}</Text>
              <Text style={dhStyles.activityTime}>{activity.time}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function AdminSidebar({ isOpen, onClose, navigation, currentUser, onLogout }) {
  const translateX = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

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
    { id: "sessions", label: "الجلسات", icon: Calendar },
    { id: "tests", label: "الاختبارات", icon: ClipboardList },
    { id: "notifications", label: "التنبيهات", icon: Bell },
    { id: "chat", label: "الدردشة", icon: MessageSquare },
    { id: "settings", label: "الإعدادات", icon: Settings },
  ];

  const routeMap = {
    supervisors: "AdminSupervisors",
    members: "AdminRegistrations",
    sessions: "AdminSeasons",
    tests: "AdminTests",
    chat: "ChatConversation",
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
            { transform: [{ translateX }] },
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
            <TouchableOpacity onPress={onClose}>
              <X size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={sbStyles.menuList}>
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
          </View>

          <View style={sbStyles.logoutWrap}>
            <TouchableOpacity style={sbStyles.logoutBtn} onPress={onLogout}>
              <LogOut size={20} color={palette.red} />
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
  const { stats, logout, currentUser, users, exams, seasons } = useApp();

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

  const handleLogout = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setSidebarOpen(true)}>
          <Menu size={24} color={palette.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>لوحة التحكم</Text>
        <View style={styles.topBarAvatar}>
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </View>
        <TouchableOpacity>
          <Bell size={24} color={palette.textSecondary} />
          {derivedStats.pendingRegs > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {derivedStats.pendingRegs > 9 ? "9+" : derivedStats.pendingRegs}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <DashboardHome navigation={navigation} stats={derivedStats} />
      </ScrollView>

      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        navigation={navigation}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
    </View>
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
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    height: "100%",
    backgroundColor: "#fff",
    elevation: 10,
  },
  header: {
    backgroundColor: palette.primary,
    padding: 16,
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
  menuList: {
    padding: 8,
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
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
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
    marginBottom: 16,
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
    marginBottom: 16,
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
});
