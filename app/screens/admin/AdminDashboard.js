import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Menu, Bell, Plus } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import ActiveSeasonBanner from "../../components/ActiveSeasonBanner";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { getSeasonDashboardStats } from "../../lib/saisonsApi";
import {
  ROLES,
  userHasRole,
  REGISTRATION_STATUS,
  ACCOUNT_STATUS,
} from "../../constants/roles";
import { rtlText, row } from "../../constants/rtl";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  teal: "#00897B",
  orange: "#D97706",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  blue: "#1976D2",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
};

const QUICK_ACTIONS = [
  {
    key: "season",
    label: "انطلاق موسم جديد",
    route: "AdminNewSeason",
    bg: palette.primary,
    fg: "#fff",
  },
  {
    key: "supervisor",
    label: "إضافة مشرف",
    route: "AdminSupervisors",
    bg: palette.gold,
    fg: palette.textPrimary,
  },
  {
    key: "exam",
    label: "إنشاء اختبار",
    route: "AdminTests",
    params: { initialTab: "create" },
    bg: palette.teal,
    fg: "#fff",
  },
  {
    key: "notify",
    label: "إشعار",
    route: "AdminNotifications",
    bg: palette.orange,
    fg: "#fff",
  },
];

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
    { label: "الحصص", value: stats?.seances ?? 0, icon: "📅" },
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

      <View style={dhStyles.actionsGrid}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={[dhStyles.actionBtn, { backgroundColor: action.bg }]}
            onPress={() =>
              navigation.navigate(action.route, action.params)
            }
          >
            <Plus size={13} color={action.fg} />
            <Text
              style={[dhStyles.actionBtnText, { color: action.fg }]}
              numberOfLines={2}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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

export default function AdminDashboard({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "home");
  const {
    stats,
    currentUser,
    exams,
    seasons,
    registrations,
    notifications,
  } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);
  const activeSeason = getActiveRegularSeason(seasons);
  const [seasonStats, setSeasonStats] = useState({
    members: 0,
    supervisors: 0,
    seances: 0,
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!activeSeason?.id) {
          setSeasonStats({ members: 0, supervisors: 0, seances: 0 });
          return;
        }
        const res = await getSeasonDashboardStats(activeSeason.id);
        if (!cancelled && res.ok) {
          setSeasonStats({
            members: res.members,
            supervisors: res.supervisors,
            seances: res.seances,
          });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeSeason?.id])
  );

  const pendingRegs = useMemo(
    () =>
      registrations.filter(
        (r) =>
          r.status === REGISTRATION_STATUS.PENDING &&
          (!activeSeason || !r.seasonId || r.seasonId === activeSeason.id)
      ).length,
    [registrations, activeSeason]
  );

  const derivedStats = {
    members: seasonStats.members,
    supervisors: seasonStats.supervisors,
    seances: seasonStats.seances,
    exams: stats?.exams ?? exams?.length ?? 0,
    pendingRegs: stats?.pendingRegs ?? pendingRegs,
  };

  const recentActivities = useMemo(
    () =>
      buildRecentActivities({
        registrations: activeSeason
          ? registrations.filter(
              (r) => !r.seasonId || r.seasonId === activeSeason.id
            )
          : registrations,
        exams,
        users: [],
        notifications,
      }),
    [registrations, exams, notifications, activeSeason]
  );

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";

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
        <View style={styles.bannerWrap}>
          <ActiveSeasonBanner
            season={activeSeason}
            hint="الإحصائيات أدناه خاصة بهذا الموسم فقط"
          />
        </View>
        <DashboardHome
          navigation={navigation}
          stats={derivedStats}
          activities={recentActivities}
        />
      </ScrollView>

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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  bannerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
  actionsGrid: {
    flexDirection: row,
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
    marginBottom: 20,
  },
  actionBtn: {
    width: "48%",
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnText: {
    flexShrink: 1,
    fontWeight: "600",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
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
