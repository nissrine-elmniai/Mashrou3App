import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  Menu,
  Bell,
  UserPlus,
  CalendarPlus,
  ClipboardPlus,
  ClipboardList,
  FileText,
  Megaphone,
  RefreshCw,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import InboxHeaderButton from "../../components/InboxHeaderButton";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { pickDisplayedActiveSeason } from "../../lib/seasonScope";
import { STATS_LABELS } from "../../lib/statsLabels";
import {
  countPendingApplications,
  getApplicationEventDate,
  listRecentMemberApplications,
} from "../../lib/memberApplicationsApi";
import { mapTestToDashboardExam } from "../../lib/testsApi";
import {
  cachedDashboardStats,
  cachedRecentAlerts,
  cachedRecentTests,
  cachedTestsCount,
} from "../../lib/adminOfflineReads";
import {
  OFFLINE_UNAVAILABLE_MESSAGE,
  fetchOnlineOnly,
  servedOffline,
} from "../../lib/offlineCache";
import { useOfflineReload } from "../../hooks/useOfflineReload";
import { REGISTRATION_KIND, REGISTRATION_STATUS } from "../../constants/roles";
import { rtlText, rtlTextCenter, row, fonts } from "../../constants/rtl";
import { colors, radii } from "../../constants/theme";
import { SectionCard } from "../../components/ui";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";

const QUICK_ACTIONS = [
  {
    key: "notify",
    label: "تنبيه",
    shortLabel: "تنبيه جديد",
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

const ACTIVITY_LABELS = {
  newRequest: "طلب تسجيل جديد",
  accepted: "تم قبول طلب",
  accountCreated: "تم إنشاء حساب العضو",
  rejected: "تم رفض طلب",
  newTest: "اختبار جديد",
  alertFallback: "تنبيه",
};

/** Accord arabe : 1 singulier, 2 duel, 3–10 pluriel, 11+ singulier. */
function formatArabicAgo(count, unit) {
  const forms = {
    minute: { one: "دقيقة", two: "دقيقتين", few: "دقائق", many: "دقيقة" },
    hour: { one: "ساعة", two: "ساعتين", few: "ساعات", many: "ساعة" },
    day: { one: "يوم", two: "يومين", few: "أيام", many: "أيام" },
  };
  const word = forms[unit];
  if (count === 1) return `منذ ${word.one}`;
  if (count === 2) return `منذ ${word.two}`;
  if (count >= 3 && count <= 10) return `منذ ${count} ${word.few}`;
  return `منذ ${count} ${word.many}`;
}

function formatRelativeTime(date) {
  if (!date || Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "الآن";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return formatArabicAgo(mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return formatArabicAgo(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return formatArabicAgo(days, "day");
  const now = new Date();
  const options = { day: "numeric", month: "short" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString("ar-MA", options);
}

function buildRecentActivities({
  registrations = [],
  exams = [],
  alerts = [],
}) {
  const items = [];

  registrations.forEach((r) => {
    const at = parseActivityDate(getApplicationEventDate(r));
    if (!at) return;
    const name = r.fullName || r.email || "مترشح";
    const icon =
      r.kind === REGISTRATION_KIND.SEASON_RENEWAL ? RefreshCw : FileText;
    if (r.status === REGISTRATION_STATUS.PENDING) {
      items.push({
        id: `reg-pending-${r.id}`,
        icon,
        color: colors.gold,
        text: `${ACTIVITY_LABELS.newRequest}: ${name}`,
        at,
      });
    } else if (
      r.status === REGISTRATION_STATUS.INVITED ||
      r.status === REGISTRATION_STATUS.ACCEPTED
    ) {
      items.push({
        id: `reg-accepted-${r.id}`,
        icon,
        color: colors.primary,
        text: `${ACTIVITY_LABELS.accepted}: ${name}`,
        at,
      });
    } else if (r.status === REGISTRATION_STATUS.ACTIVATED) {
      items.push({
        id: `reg-activated-${r.id}`,
        icon,
        color: colors.primary,
        text: `${ACTIVITY_LABELS.accountCreated}: ${name}`,
        at,
      });
    } else if (r.status === REGISTRATION_STATUS.REJECTED) {
      items.push({
        id: `reg-rejected-${r.id}`,
        icon,
        color: colors.red,
        text: `${ACTIVITY_LABELS.rejected}: ${name}`,
        at,
      });
    }
  });

  exams.forEach((exam) => {
    const at = parseActivityDate(exam.createdAt);
    if (!at) return;
    items.push({
      id: `exam-${exam.id}`,
      icon: ClipboardList,
      color: colors.primary,
      text: `${ACTIVITY_LABELS.newTest}: ${exam.title || "اختبار"}`,
      at,
    });
  });

  alerts.forEach((alert) => {
    const at = parseActivityDate(alert.createdAt);
    if (!at) return;
    const text = alert.message || alert.title || ACTIVITY_LABELS.alertFallback;
    items.push({
      id: `alert-${alert.id}`,
      icon: Bell,
      color: colors.red,
      text,
      at,
    });
  });

  return items
    .sort((a, b) => b.at - a.at)
    .slice(0, 10)
    .map((item) => ({
      id: item.id,
      icon: item.icon,
      color: item.color,
      text: item.text,
      time: formatRelativeTime(item.at),
    }));
}

function DashboardHome({
  navigation,
  stats,
  activities,
  loading,
  error,
  onRetry,
  noSeason,
  multipleActive,
  activitiesUnknown = false,
  applicationsUnavailable = false,
}) {
  if (loading) {
    return (
      <View style={dhStyles.stateBox}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={dhStyles.stateText}>{STATS_LABELS.loadingData}</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={dhStyles.stateBox}>
        <Text style={dhStyles.errorText}>{error}</Text>
        <TouchableOpacity style={dhStyles.retryBtn} onPress={onRetry}>
          <Text style={dhStyles.retryText}>إعادة المحاولة</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (noSeason) {
    return (
      <View style={dhStyles.wrapper}>
        <Text style={dhStyles.activityEmpty}>لا يوجد موسم نشط</Text>
        <View style={dhStyles.secondaryItem}>
          <Text style={dhStyles.secondaryValue}>—</Text>
          <Text style={dhStyles.secondaryLabel}>الاختبارات</Text>
        </View>
        <View style={dhStyles.actionsRow}>
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <TouchableOpacity
                key={action.key}
                style={dhStyles.actionBtn}
                onPress={() => navigation.navigate(action.route, action.params)}
                activeOpacity={0.85}
              >
                <Icon size={20} color={colors.gold} pointerEvents="none" />
                <Text style={dhStyles.actionLabel} numberOfLines={2}>
                  {action.shortLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  // Compteur inconnu (hors ligne, jamais lu) : « — », jamais 0.
  const members = stats?.members ?? null;
  // Hero = membres du saison. 1 → عضو مسجّل, sinon → أعضاء مسجّلون.
  const secondaryStats = [
    { key: "supervisors", label: "المشرفون", value: stats?.supervisors ?? "—" },
    { key: "seances", label: "الحصص", value: stats?.seances ?? "—" },
    {
      key: "exams",
      label: "الاختبارات",
      value: stats?.exams == null ? "—" : stats.exams,
    },
  ];

  return (
    <View style={dhStyles.wrapper}>
      <SectionCard borderColor={colors.border}>
        <View style={dhStyles.heroRow}>
          <Text style={dhStyles.heroValue}>{members ?? "—"}</Text>
          <Text style={dhStyles.heroLabel}>{membersLabel(members)}</Text>
        </View>
        {multipleActive ? (
          <Text style={dhStyles.multiWarning}>يوجد أكثر من موسم نشط</Text>
        ) : null}
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
        {/* Hors ligne : demandes d'inscription jamais en cache (tests et alertes : cache). */}
        {applicationsUnavailable && !activitiesUnknown ? (
          <Text style={dhStyles.activityEmpty}>
            {`طلبات التسجيل: ${OFFLINE_UNAVAILABLE_MESSAGE}`}
          </Text>
        ) : null}
        {activitiesUnknown ? (
          <Text style={dhStyles.activityEmpty}>{OFFLINE_UNAVAILABLE_MESSAGE}</Text>
        ) : activities.length === 0 ? (
          applicationsUnavailable ? null : (
            <Text style={dhStyles.activityEmpty}>لا يوجد نشاط بعد</Text>
          )
        ) : (
          activities.map((activity) => {
            const Icon = activity.icon;
            return (
            <View key={activity.id} style={dhStyles.activityRow}>
              <View style={dhStyles.activityIconWrap}>
                {Icon ? (
                  <Icon size={16} color={colors.muted} pointerEvents="none" />
                ) : null}
              </View>
              <Text style={dhStyles.activityText} numberOfLines={2}>
                {activity.text}
              </Text>
              {activity.time ? (
                <Text style={dhStyles.activityWhen}>{activity.time}</Text>
              ) : null}
            </View>
            );
          })
        )}
      </SectionCard>
    </View>
  );
}

export default function AdminDashboard({ navigation }) {
  const {
    currentUser,
    seasons,
  } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);
  const { season: activeSeason, multiple: multipleActive } = pickDisplayedActiveSeason(seasons);
  const [seasonStats, setSeasonStats] = useState(null);
  const [examCount, setExamCount] = useState(null);
  const [recentExams, setRecentExams] = useState([]);
  const [recentApplications, setRecentApplications] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [pendingApplications, setPendingApplications] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Hors ligne : tests et alertes récents tous deux inconnus / demandes non lues.
  const [activitiesUnknown, setActivitiesUnknown] = useState(false);
  const [applicationsUnavailable, setApplicationsUnavailable] = useState(false);
  // Retour du réseau : relecture si l'écran est affiché (sinon au prochain focus).
  const markOffline = useOfflineReload(() => setReloadKey((n) => n + 1));
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "home", {
    registrationsBadge: pendingApplications,
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setDashLoading(true);
        setDashError(null);
        setPendingApplications(null);
        if (!activeSeason?.id) {
          if (!cancelled) {
            setSeasonStats(null);
            setExamCount(null);
            setRecentExams([]);
            setRecentApplications([]);
            setRecentAlerts([]);
            setPendingApplications(0);
            setActivitiesUnknown(false);
            setApplicationsUnavailable(false);
            setDashLoading(false);
          }
          return;
        }
        const [res, countRes, listRes, pendingRes, appsRes, alertsRes] = await Promise.all([
          cachedDashboardStats(activeSeason.id),
          cachedTestsCount(activeSeason.id),
          cachedRecentTests(activeSeason.id, 8),
          // Demandes d'inscription : jamais en cache.
          fetchOnlineOnly(() => countPendingApplications(activeSeason.id)),
          fetchOnlineOnly(() => listRecentMemberApplications(activeSeason.id, 30)),
          cachedRecentAlerts(activeSeason.id, 10),
        ]);
        if (cancelled) return;
        const results = [res, countRes, listRes, pendingRes, appsRes, alertsRes];
        markOffline(...results);
        if (results.some(servedOffline)) {
          // Hors ligne : chaque bloc affiche ce qui est connu, sans Alert ni erreur globale.
          setSeasonStats(
            res.ok
              ? { members: res.members, supervisors: res.supervisors, seances: res.seances }
              : null
          );
          setExamCount(countRes.ok ? countRes.count ?? 0 : null);
          setRecentExams(listRes.ok ? (listRes.tests || []).map(mapTestToDashboardExam) : []);
          setRecentApplications(appsRes.ok ? appsRes.applications || [] : []);
          setRecentAlerts(alertsRes.ok ? alertsRes.alerts || [] : []);
          setPendingApplications(pendingRes.ok ? pendingRes.count ?? 0 : null);
          setActivitiesUnknown(!listRes.ok && !alertsRes.ok);
          setApplicationsUnavailable(!appsRes.ok);
          setDashLoading(false);
          return;
        }
        setActivitiesUnknown(false);
        setApplicationsUnavailable(false);
        if (
          !res.ok ||
          !countRes.ok ||
          !listRes.ok ||
          !pendingRes.ok ||
          !appsRes.ok ||
          !alertsRes.ok
        ) {
          setDashError(
            res.error ||
              countRes.error ||
              listRes.error ||
              pendingRes.error ||
              appsRes.error ||
              alertsRes.error ||
              "تعذر تحميل البيانات"
          );
          setDashLoading(false);
          return;
        }
        setSeasonStats({
          members: res.members,
          supervisors: res.supervisors,
          seances: res.seances,
        });
        setExamCount(countRes.count ?? 0);
        setRecentExams((listRes.tests || []).map(mapTestToDashboardExam));
        setRecentApplications(appsRes.applications || []);
        setRecentAlerts(alertsRes.alerts || []);
        setPendingApplications(pendingRes.count ?? 0);
        setDashLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [activeSeason?.id, reloadKey, markOffline])
  );

  // null : compteur inconnu hors ligne (affiché « — »). En ligne, toujours lu.
  const derivedStats = {
    members: seasonStats?.members ?? null,
    supervisors: seasonStats?.supervisors ?? null,
    seances: seasonStats?.seances ?? null,
    exams: examCount,
  };

  const recentActivities = useMemo(
    () =>
      buildRecentActivities({
        registrations: recentApplications,
        exams: recentExams,
        alerts: recentAlerts,
      }),
    [recentApplications, recentExams, recentAlerts]
  );

  const barTitle = activeSeason?.name || "";

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
        <Text
          style={styles.topBarTitle}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {barTitle}
        </Text>
        <AdminTopBarAvatar
          currentUser={currentUser}
          onPress={() => navigation.navigate("AdminProfile")}
        />
        <InboxHeaderButton
          navigation={navigation}
          color={colors.muted}
          variant="lucide"
          size={24}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="التنبيهات"
        >
          <Bell size={24} color={colors.muted} pointerEvents="none" />
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
          loading={dashLoading}
          error={dashError}
          onRetry={() => setReloadKey((n) => n + 1)}
          noSeason={!activeSeason?.id}
          multipleActive={multipleActive}
          activitiesUnknown={activitiesUnknown}
          applicationsUnavailable={applicationsUnavailable}
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
  multiWarning: {
    marginTop: 8,
    color: "#8D6E00",
    fontSize: 13,
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
  stateBox: {
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  stateText: {
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  errorText: {
    color: "#D32F2F",
    textAlign: "center",
    fontFamily: fonts.regular,
    ...rtlText,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: "#fff",
    fontFamily: fonts.bold,
    ...rtlText,
  },
});
