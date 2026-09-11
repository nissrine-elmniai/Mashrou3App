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
import {
  Menu,
  Bell,
  UserPlus,
  CalendarPlus,
  ClipboardPlus,
  Megaphone,
  Activity,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { getSeasonDashboardStats } from "../../lib/saisonsApi";
import {
  ROLES,
  userHasRole,
  REGISTRATION_STATUS,
  ACCOUNT_STATUS,
} from "../../constants/roles";
import { rtlText, rtlTextCenter, row, fonts } from "../../constants/rtl";
import { colors, radii } from "../../constants/theme";
import { SectionCard } from "../../components/ui";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";

const QUICK_ACTIONS = [
  {
    key: "notify",
    label: "إشعار",
    shortLabel: "إشعار جديد",
    route: "AdminNotifications",
    icon: Megaphone,
  },
  {
    key: "supervisor",
    label: "إضافة مشرف",
    shortLabel: "مشرف جديد",
    route: "AdminSupervisors",
    icon: UserPlus,
  },
  {
    key: "exam",
    label: "إنشاء اختبار",
    shortLabel: "اختبار جديد",
    route: "AdminTests",
    params: { initialTab: "create" },
    icon: ClipboardPlus,
  },
  {
    key: "season",
    label: "انطلاق موسم جديد",
    shortLabel: "موسم جديد",
    route: "AdminNewSeason",
    icon: CalendarPlus,
  },
];

/** 1 : عضو مسجّل — sinon : أعضاء مسجّلون. */
function membersLabel(count) {
  return count === 1 ? "عضو مسجّل" : "أعضاء مسجّلون";
}

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
        color: colors.gold,
        text: `طلب تسجيل جديد: ${name}`,
        at: parseActivityDate(r.createdAt) || new Date(0),
      });
    } else if (
      r.status === REGISTRATION_STATUS.INVITED ||
      r.status === REGISTRATION_STATUS.ACCEPTED
    ) {
      items.push({
        id: `reg-accepted-${r.id}`,
        color: colors.primary,
        text: `تم قبول طلب: ${name}`,
        at:
          parseActivityDate(r.acceptedAt) ||
          parseActivityDate(r.createdAt) ||
          new Date(0),
      });
    } else if (r.status === REGISTRATION_STATUS.ACTIVATED) {
      items.push({
        id: `reg-activated-${r.id}`,
        color: colors.primary,
        text: `تم إنشاء حساب العضو: ${name}`,
        at:
          parseActivityDate(r.acceptedAt) ||
          parseActivityDate(r.createdAt) ||
          new Date(0),
      });
    } else if (r.status === REGISTRATION_STATUS.REJECTED) {
      items.push({
        id: `reg-rejected-${r.id}`,
        color: colors.red,
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
        color: colors.red,
        text: `تم إلغاء الاختبار: ${title}`,
        at: parseActivityDate(e.createdAt) || parseActivityDate(e.date) || new Date(0),
      });
    } else if (e.status === "completed") {
      items.push({
        id: `exam-done-${e.id}`,
        color: colors.blue,
        text: `تم إنجاز الاختبار: ${title}`,
        at: parseActivityDate(e.createdAt) || parseActivityDate(e.date) || new Date(0),
      });
    } else {
      items.push({
        id: `exam-${e.id}`,
        color: colors.blue,
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
      color: colors.gold,
      text: `تعيين مشرف جديد: ${name}`,
      at: parseActivityDate(u.createdAt) || new Date(0),
    });
  });

  notifications.forEach((n) => {
    const title = String(n.title || "");
    if (!title.includes("تنبيه")) return;
    items.push({
      id: `notif-${n.id}`,
      color: colors.red,
      text: n.body ? `${title}: ${n.body}` : title,
      at: parseActivityDate(n.createdAt) || new Date(0),
    });
  });

  return items
    .sort((a, b) => b.at - a.at)
    .slice(0, 10)
    .map((item) => ({
      id: item.id,
      color: item.color,
      text: item.text,
      time: formatRelativeTime(item.at),
    }));
}

function DashboardHome({ navigation, stats, activities }) {
  const members = stats?.members ?? 0;
  const pendingRegs = stats?.pendingRegs ?? 0;
  // Hero = membres du saison. 1 → عضو مسجّل, sinon → أعضاء مسجّلون.
  const secondaryStats = [
    { key: "supervisors", label: "المشرفون", value: stats?.supervisors ?? 0 },
    { key: "seances", label: "الحصص", value: stats?.seances ?? 0 },
    { key: "exams", label: "الاختبارات", value: stats?.exams ?? 0 },
  ];

  return (
    <View style={dhStyles.wrapper}>
      <SectionCard borderColor={colors.border}>
        <View style={dhStyles.heroRow}>
          <Text style={dhStyles.heroValue}>{members}</Text>
          <Text style={dhStyles.heroLabel}>{membersLabel(members)}</Text>
          {pendingRegs > 0 ? (
            <View style={dhStyles.pendingBadge}>
              <Text style={dhStyles.pendingBadgeText}>
                {pendingRegs} معلق
              </Text>
            </View>
          ) : null}
        </View>
        <View style={dhStyles.statDivider} />
        <View style={dhStyles.secondaryRow}>
          {secondaryStats.map((stat) => (
            <View key={stat.key} style={dhStyles.secondaryItem}>
              <Text style={dhStyles.secondaryValue}>{stat.value}</Text>
              <Text style={dhStyles.secondaryLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      <View style={dhStyles.actionsRow}>
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <TouchableOpacity
              key={action.key}
              style={dhStyles.actionBtn}
              onPress={() =>
                navigation.navigate(action.route, action.params)
              }
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Icon size={20} color={colors.gold} pointerEvents="none" />
              <Text style={dhStyles.actionLabel} numberOfLines={2}>
                {action.shortLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SectionCard title="آخر النشاطات" borderColor={colors.border}>
        {activities.length === 0 ? (
          <Text style={dhStyles.activityEmpty}>لا يوجد نشاط بعد</Text>
        ) : (
          activities.map((activity) => (
            <View key={activity.id} style={dhStyles.activityRow}>
              <View style={dhStyles.activityIconWrap}>
                <Activity
                  size={16}
                  color={colors.muted}
                  pointerEvents="none"
                />
              </View>
              <Text style={dhStyles.activityText} numberOfLines={2}>
                {activity.text}
              </Text>
              {activity.time ? (
                <Text style={dhStyles.activityWhen}>{activity.time}</Text>
              ) : null}
            </View>
          ))
        )}
      </SectionCard>
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={openSidebar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
        >
          <Menu size={24} color={colors.text} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>لوحة التحكم</Text>
        <AdminTopBarAvatar
          currentUser={currentUser}
          onPress={() => navigation.navigate("AdminProfile")}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="التنبيهات"
        >
          <Bell size={24} color={colors.muted} pointerEvents="none" />
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

      {messagesFab}
      {sidebar}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  topBar: {
    backgroundColor: colors.card,
    padding: 16,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: 16,
    ...rtlText,
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  bellBadgeText: {
    color: colors.card,
    fontSize: 10,
    fontFamily: fonts.bold,
  },
});

const dhStyles = StyleSheet.create({
  wrapper: {
    padding: 16,
  },
  heroRow: {
    flexDirection: row,
    alignItems: "baseline",
    gap: 8,
  },
  heroValue: {
    fontSize: 34,
    fontFamily: fonts.bold,
    color: colors.primary,
    lineHeight: 40,
  },
  heroLabel: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  pendingBadge: {
    alignSelf: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pendingBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  statDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  secondaryRow: {
    flexDirection: row,
  },
  secondaryItem: {
    flex: 1,
    alignItems: "center",
  },
  secondaryValue: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.primary,
    lineHeight: 24,
  },
  secondaryLabel: {
    color: colors.text,
    fontSize: 13,
    fontFamily: fonts.regular,
    marginTop: 2,
    ...rtlTextCenter,
  },
  actionsRow: {
    flexDirection: row,
    gap: 16,
    marginTop: 18,
    marginBottom: 22,
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionLabel: {
    color: colors.muted,
    fontFamily: fonts.semiBold,
    fontSize: 11,
    lineHeight: 16,
    includeFontPadding: false,
    ...rtlTextCenter,
  },
  activityRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  activityIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  activityText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  activityWhen: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  activityEmpty: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: "center",
    paddingVertical: 12,
    ...rtlText,
  },
});
