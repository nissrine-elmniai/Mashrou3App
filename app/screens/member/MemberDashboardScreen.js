import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  I18nManager,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Home, BookOpen, User, ClipboardList, Target } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import {
  getMyProgress,
  computeProgressMetrics,
  computeProgressPace,
  latestProgressionRow,
  getMemberSeasonObjectif,
} from "../../lib/progressApi";
import {
  REGISTRATION_STATUS_LABELS,
  SEASON_TYPES,
} from "../../constants/roles";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextCenter, row, arrowForward, fonts } from "../../constants/rtl";
import {
  StatCard,
  SectionCard,
  EmptyState,
  MemberBottomTabBar,
} from "../../components/ui";
import { ProgressRing } from "../../components/ProgressRing";
import {
  getVisibleAlerts,
  getUnacknowledgedAlerts,
  subscribeToNewAlerts,
} from "../../lib/alertsApi";
import {
  getMemberProfileFields,
  formatGenderLabel,
} from "../../lib/membersApi";
import { getMySeance, getMyInscriptionDate, formatUnreadBadge } from "../../lib/messagesApi";
import { useInboxThreads } from "../../hooks/useInboxThreads";
import { getMemberPresenceSummary } from "../../lib/presenceApi";
import { TOTAL_HIZB, TUMUNS_PER_HIZB } from "../../lib/tumun";
import ProfileInfoCard from "../../components/profile/ProfileInfoCard";
import ProfileHero from "../../components/profile/ProfileHero";
import ProfilePasswordCard from "../../components/profile/ProfilePasswordCard";
import SessionCard from "../../components/profile/SessionCard";
import ProgressCard from "../../components/profile/ProgressCard";
import AttendanceCard from "../../components/profile/AttendanceCard";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import EditProfileInfoModal from "../../components/profile/EditProfileInfoModal";
import MemberProgramsPanel from "./MemberProgramsPanel";
import MemberRegistrationPanel from "./MemberRegistrationPanel";

/** Genre depuis currentUser uniquement — pas de fetch member_applications. */
function displayGenderFromUser(gender) {
  const raw = String(gender || "").trim();
  if (!raw || raw === "غير محدد") return null;
  return formatGenderLabel(raw) || null;
}

const alignEdge = I18nManager.isRTL ? "flex-start" : "flex-end";
const TOTAL_JUZ = 30;
const QURAN_TUMUNS = TOTAL_HIZB * TUMUNS_PER_HIZB;
const LRI = "\u2066";
const PDI = "\u2069";

/**
 * Pourcentage d'anneau depuis tumunTotal (480). Une décimale ;
 * 0 % et 100 % sans décimale. Isolat LTR pour le point et « % ».
 */
function formatRingPercent(tumunTotal) {
  const raw = Math.min(
    100,
    Math.max(0, ((Number(tumunTotal) || 0) / QURAN_TUMUNS) * 100)
  );
  if (raw <= 0) {
    return { progress: 0, label: `${LRI}0%${PDI}` };
  }
  if (raw >= 100) {
    return { progress: 100, label: `${LRI}100%${PDI}` };
  }
  const one = Math.round(raw * 10) / 10;
  if (one >= 100) {
    return { progress: 100, label: `${LRI}100%${PDI}` };
  }
  if (one <= 0) {
    return { progress: 0, label: `${LRI}0%${PDI}` };
  }
  return { progress: one, label: `${LRI}${one.toFixed(1)}%${PDI}` };
}

function parseGoalJuzCount(raw) {
  if (!raw) return null;
  const num = parseInt(String(raw).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function parseActivityTimestamp(raw) {
  if (!raw) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  if (s.includes("T")) {
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  const t = new Date(s.replace(/\//g, "-")).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function formatActivityWhen(ts) {
  if (!ts) return "";
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `منذ ${diffMin} د`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `منذ ${diffH} س`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `منذ ${diffD} ي`;
  return new Date(ts).toLocaleDateString("ar-MA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TABS = [
  { key: "home", label: "الرئيسية", icon: Home },
  { key: "programs", label: "برامجي", icon: BookOpen },
  { key: "registration", label: "التسجيل", icon: ClipboardList },
  { key: "profile", label: "ملفي", icon: User },
];

export default function MemberDashboardScreen({ navigation }) {
  const {
    currentUser,
    seasons,
    registrations,
    exams,
    logout,
    submitSeasonRegistration,
    getNotificationsForUser,
    getMemberPrograms,
  } = useApp();

  const authId = currentUser?.authId || currentUser?.id || null;
  const { threads } = useInboxThreads();
  const messagesUnread = useMemo(
    () => (threads || []).reduce((sum, t) => sum + (Number(t.unreadCount) || 0), 0),
    [threads]
  );

  const [tab, setTab] = useState("home");
  const [adminAlerts, setAdminAlerts] = useState([]);
  const [pendingAlertCount, setPendingAlertCount] = useState(0);
  const [progressEntries, setProgressEntries] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [selectedTimes, setSelectedTimes] = useState([]);
  const [summerTimes, setSummerTimes] = useState([]);
  const [passwordModal, setPasswordModal] = useState(false);
  const [editInfoModal, setEditInfoModal] = useState(false);
  const [seasonObjectif, setSeasonObjectif] = useState("");
  const [contactFields, setContactFields] = useState({
    phone: currentUser?.phone || null,
    school: currentUser?.school || null,
    level: currentUser?.level || null,
    hifzAmount: currentUser?.hifzAmount || null,
  });
  const [sessionState, setSessionState] = useState({
    loading: false,
    groupName: null,
    jour: null,
    heureDebut: null,
    seanceId: null,
    saisonId: null,
    registrationDate: null,
  });
  const [progressState, setProgressState] = useState({
    loading: false,
    error: null,
    hasData: false,
    metrics: null,
    note: null,
    objectif: null,
  });
  const [presenceState, setPresenceState] = useState({
    loading: false,
    error: null,
    hasData: false,
    rate: null,
    presentCount: 0,
    absentCount: 0,
    records: [],
  });

  const loadProgressEntries = useCallback(async () => {
    setActivitiesLoading(true);
    const res = await getMyProgress();
    if (res.ok) {
      setProgressEntries(res.entries || []);
    }
    setActivitiesLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProgressEntries();
    }, [loadProgressEntries])
  );

  const loadAlerts = useCallback(async () => {
    const [visible, pending] = await Promise.all([
      getVisibleAlerts(),
      getUnacknowledgedAlerts(),
    ]);
    if (visible.ok) setAdminAlerts(visible.alerts.slice(0, 3));
    if (pending.ok) setPendingAlertCount(pending.alerts.length);
  }, []);

  useEffect(() => {
    loadAlerts();
    return subscribeToNewAlerts(() => loadAlerts());
  }, [loadAlerts]);

  useFocusEffect(
    useCallback(() => {
      loadAlerts();
    }, [loadAlerts])
  );

  const openRegular = seasons.filter(
    (s) => s.registrationOpen && s.type === SEASON_TYPES.REGULAR
  );
  const openSummer = seasons.filter(
    (s) => s.registrationOpen && s.type === SEASON_TYPES.SUMMER
  );

  const myRegs = registrations.filter((r) => r.userId === currentUser?.id);

  const activeRegular =
    seasons.find((s) => s.active && s.type === SEASON_TYPES.REGULAR) ||
    seasons.find((s) => s.type === SEASON_TYPES.REGULAR);
  const activeSummer =
    seasons.find((s) => s.active && s.type === SEASON_TYPES.SUMMER) ||
    seasons.find((s) => s.type === SEASON_TYPES.SUMMER);

  const loadSeasonObjectif = useCallback(async () => {
    const memberId = currentUser?.authId || currentUser?.id;
    if (!memberId || !activeRegular?.id) {
      setSeasonObjectif("");
      return;
    }
    const res = await getMemberSeasonObjectif(memberId, activeRegular.id);
    if (res.ok && res.objectif) {
      setSeasonObjectif(res.objectif);
    } else {
      setSeasonObjectif("");
    }
  }, [currentUser?.authId, currentUser?.id, activeRegular?.id]);

  useFocusEffect(
    useCallback(() => {
      loadSeasonObjectif();
    }, [loadSeasonObjectif])
  );

  const loadProfileData = useCallback(async () => {
    if (!authId) {
      setSessionState({
        loading: false,
        groupName: null,
        jour: null,
        heureDebut: null,
        seanceId: null,
        saisonId: null,
        registrationDate: null,
      });
      setProgressState({
        loading: false,
        error: null,
        hasData: false,
        metrics: null,
        note: null,
        objectif: null,
      });
      setPresenceState({
        loading: false,
        error: null,
        hasData: false,
        rate: null,
        presentCount: 0,
        absentCount: 0,
        records: [],
      });
      return;
    }

    setProgressState((s) => ({ ...s, loading: true, error: null }));
    setPresenceState((s) => ({ ...s, loading: true, error: null }));
    setSessionState((s) => ({ ...s, loading: true }));

    const [fieldsRes, seanceRes, inscRes] = await Promise.all([
      getMemberProfileFields(authId),
      getMySeance(),
      getMyInscriptionDate(authId),
    ]);

    if (fieldsRes.ok) {
      setContactFields({
        phone: fieldsRes.telephone || currentUser?.phone || null,
        school: fieldsRes.ecole || currentUser?.school || null,
        level: fieldsRes.niveau || currentUser?.level || null,
        hifzAmount: fieldsRes.quantiteHifz || currentUser?.hifzAmount || null,
      });
    }

    const seance = seanceRes.ok ? seanceRes.seance : null;
    const seanceId = seance?.id || null;
    const saisonId = seance?.saison_id || null;

    setSessionState({
      loading: false,
      groupName: seance?.nom || null,
      jour: seance?.jour || null,
      heureDebut: seance?.heure_debut || null,
      seanceId,
      saisonId,
      registrationDate: inscRes.ok ? inscRes.dateInscription : null,
    });

    const [objRes, presRes] = await Promise.all([
      saisonId
        ? getMemberSeasonObjectif(authId, saisonId)
        : Promise.resolve({ ok: true, objectif: null }),
      getMemberPresenceSummary(authId, seanceId),
    ]);

    setProgressState((s) => ({
      ...s,
      loading: false,
      error: null,
      objectif: objRes.ok && objRes.objectif ? objRes.objectif : null,
    }));

    if (!presRes.ok) {
      setPresenceState({
        loading: false,
        error: presRes.error,
        hasData: false,
        rate: null,
        presentCount: 0,
        absentCount: 0,
        records: [],
      });
    } else {
      setPresenceState({
        loading: false,
        error: null,
        hasData: presRes.hasData,
        rate: presRes.rate,
        presentCount: presRes.presentCount ?? 0,
        absentCount: presRes.absentCount ?? 0,
        records: presRes.records || [],
      });
    }
  }, [
    authId,
    currentUser?.phone,
    currentUser?.school,
    currentUser?.level,
    currentUser?.hifzAmount,
  ]);

  const handleProfileInfoSaved = useCallback(
    (saved) => {
      setContactFields((prev) => ({
        ...prev,
        phone: saved?.phone ?? prev.phone,
        school: saved?.school ?? prev.school,
        level: saved?.level ?? prev.level,
      }));
      loadProfileData();
    },
    [loadProfileData]
  );

  // Profil : chargement uniquement quand le tab "ملفي" est actif (pas au montage dashboard).
  useEffect(() => {
    if (tab !== "profile") return;
    loadProfileData();
  }, [tab, loadProfileData]);

  useEffect(() => {
    setContactFields((prev) => ({
      phone: prev.phone || currentUser?.phone || null,
      school: prev.school || currentUser?.school || null,
      level: prev.level || currentUser?.level || null,
      hifzAmount: prev.hifzAmount || currentUser?.hifzAmount || null,
    }));
  }, [
    currentUser?.phone,
    currentUser?.school,
    currentUser?.level,
    currentUser?.hifzAmount,
  ]);

  const myExams = exams.filter((e) => e.memberId === currentUser?.id);
  const myMemberPrograms = getMemberPrograms();

  const activePrograms = myMemberPrograms.length;

  const memorizationMetrics = useMemo(() => {
    const latest = latestProgressionRow(progressEntries);
    return latest ? computeProgressMetrics(latest) : null;
  }, [progressEntries]);

  const totalAhzab = memorizationMetrics?.nbHizbCompletes ?? 0;

  const progressPace = useMemo(
    () =>
      computeProgressPace(
        progressEntries,
        getActiveRegularSeason(seasons)?.id ?? null
      ),
    [progressEntries, seasons]
  );

  const profileProgressState = useMemo(
    () => ({
      loading:
        !memorizationMetrics && (activitiesLoading || progressState.loading),
      error: progressState.error,
      hasData: !!memorizationMetrics,
      metrics: memorizationMetrics,
      note: memorizationMetrics?.notes || null,
      objectif: progressState.objectif,
      seasonDeltaTumuns: progressPace.seasonDeltaTumuns,
      weekDeltaTumuns: progressPace.weekDeltaTumuns,
    }),
    [
      memorizationMetrics,
      activitiesLoading,
      progressState.loading,
      progressState.error,
      progressState.objectif,
      progressPace,
    ]
  );

  const homeProgress = useMemo(() => {
    if (memorizationMetrics) {
      const ring = formatRingPercent(memorizationMetrics.tumunTotal);
      return {
        memorizationPct: ring.progress,
        memorizationPctLabel: ring.label,
        memorizedJuz: memorizationMetrics.juzeCourant ?? 0,
      };
    }
    const ring = formatRingPercent(0);
    return {
      memorizationPct: 0,
      memorizationPctLabel: ring.label,
      memorizedJuz: 0,
    };
  }, [memorizationMetrics]);

  const { memorizationPct, memorizationPctLabel, memorizedJuz } = homeProgress;

  const goalRaw =
    String(currentUser?.hifzAmount || "").trim() ||
    String(seasonObjectif || "").trim();
  const goalJuz = parseGoalJuzCount(goalRaw);
  const goalLabel = goalJuz
    ? `هدفي: حفظ ${goalJuz} أجزاء`
    : goalRaw
      ? `هدفي: ${goalRaw}`
      : "هدفي: لم يُحدد بعد";
  const goalPct = goalJuz
    ? Math.min(100, Math.round((memorizedJuz / goalJuz) * 100))
    : 0;

  const userNotifications = useMemo(
    () => getNotificationsForUser(currentUser),
    [currentUser, getNotificationsForUser]
  );

  const recentActivities = useMemo(() => {
    const items = [];
    if (!currentUser?.id) return items;

    progressEntries.forEach((entry, idx) => {
      const metrics = computeProgressMetrics(entry);
      let body = metrics?.notes || `${metrics?.nbHizbCompletes ?? 0} حزب مكتمل`;
      if (metrics?.tumunCourant != null) {
        body += ` — الثمن ${metrics.tumunCourant}`;
      }
      if (metrics?.globalPct != null) {
        body += ` • ${metrics.globalPct}% من القرآن`;
      }
      items.push({
        id: `progress-${entry.id || idx}`,
        at: parseActivityTimestamp(
          entry.date || entry.date_saisie || entry.created_at
        ),
        title: "تحديث التقدم",
        body,
        icon: "book-outline",
        color: colors.primary,
        action: "progress",
      });
    });

    myRegs.forEach((r) => {
      const season = seasons.find((s) => s.id === r.seasonId);
      const statusLabel =
        REGISTRATION_STATUS_LABELS[r.status] || r.status || "—";
      items.push({
        id: `reg-${r.id}`,
        at: Math.max(
          parseActivityTimestamp(r.createdAt),
          parseActivityTimestamp(r.acceptedAt)
        ),
        title: "طلب تسجيل",
        body: `${season?.name || "موسم"} — ${statusLabel}`,
        icon: "document-text-outline",
        color: colors.orange,
        action: "registration",
      });
    });

    myExams.forEach((e) => {
      items.push({
        id: `exam-${e.id}`,
        at: parseActivityTimestamp(e.date),
        title: "نتيجة اختبار",
        body: `${e.level || e.title || "اختبار"} — الدرجة: ${e.score}`,
        icon: "school-outline",
        color: colors.gold,
        action: "registration",
      });
    });

    userNotifications
      .filter((n) => n.audience === "user" && n.userId === currentUser.id)
      .forEach((n) => {
        items.push({
          id: `notif-${n.id}`,
          at: parseActivityTimestamp(n.createdAt),
          title: n.title,
          body: n.body,
          icon: "notifications-outline",
          color: colors.primaryDark,
          action: null,
        });
      });

    return items
      .filter((item) => item.at > 0)
      .sort((a, b) => b.at - a.at)
      .slice(0, 5);
  }, [
    currentUser?.id,
    progressEntries,
    myRegs,
    myExams,
    seasons,
    userNotifications,
  ]);

  const fullName = currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : "";

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

  const handleRegister = (seasonId, times, resetFn) => {
    if (times.length === 0) {
      Alert.alert("تنبيه", "اختر أوقات فراغك");
      return;
    }
    const result = submitSeasonRegistration({ seasonId, freeTimes: times });
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return;
    }
    Alert.alert("تم", "تم إرسال طلب التسجيل");
    resetFn([]);
  };

  const openProgression = () => navigation.navigate("MemberProgress");

  const openProgramme = (program) =>
    navigation.navigate("ProgrammeDetails", {
      programme: {
        id: program.id,
        nom: program.title,
        nbHizb: program.nbHizb,
        duree: program.durationDays,
        progression: program.progression,
        type: program.type,
        dateDebut: program.startDate,
        statut: program.progression >= 100 ? "terminé" : "en cours",
      },
    });

  const openChat = () => navigation.navigate("MemberChatInbox");

  const handleActivityPress = (activity) => {
    if (activity.action === "progress") {
      openProgression();
      return;
    }
    if (activity.action === "program" && myMemberPrograms[0]) {
      openProgramme(myMemberPrograms[0]);
      return;
    }
    if (activity.action === "registration") {
      setTab("registration");
      return;
    }
    if (activity.action === "programs") {
      setTab("programs");
    }
  };

  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <View style={styles.headerWrap}>
        <LinearGradient colors={colors.gradientHeader} style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerGreeting}>
                {tab === "programs"
                  ? "برامجي"
                  : tab === "registration"
                    ? "التسجيل والموسم"
                    : tab === "profile"
                      ? "ملفي"
                      : "السلام عليكم"}
              </Text>
              {tab === "home" ? (
                <Text style={styles.headerSubtitle}>
                  {currentUser?.firstName || fullName}
                </Text>
              ) : null}
            </View>
            {tab === "programs" ? (
              <Ionicons name="book" size={22} color="white" />
            ) : tab === "registration" ? (
              <Ionicons name="clipboard-outline" size={22} color="white" />
            ) : null}
            {tab === "home" || tab === "profile" ? (
              <View style={styles.headerEnd}>
                <TouchableOpacity style={styles.headerBtn} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={22} color="white" />
                </TouchableOpacity>
                {tab === "home" ? (
                  <TouchableOpacity
                    style={styles.headerIconWrap}
                    onPress={() => navigation.navigate("MemberAlerts")}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="تنبيهات الإدارة"
                  >
                    <Ionicons name="notifications-outline" size={22} color="white" />
                    {pendingAlertCount > 0 ? (
                      <View style={styles.headerBellBadge}>
                        <Text style={styles.headerBellBadgeText}>
                          {pendingAlertCount > 9 ? "9+" : pendingAlertCount}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: 32 + Math.max(insets.bottom, 16) },
        ]}
      >
        {tab === "home" && (
          <>
            <TouchableOpacity
              style={styles.heroCard}
              onPress={openProgression}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="تسجيل موضعي في القرآن"
            >
              <ProgressRing
                progress={memorizationPct}
                size={148}
                stroke={12}
                color={colors.primary}
              >
                <View style={styles.ringInner} pointerEvents="none">
                  <Text style={styles.ringPct}>{memorizationPctLabel}</Text>
                  <Text style={styles.ringSubLabel}>نسبة الحفظ الكلية</Text>
                </View>
              </ProgressRing>
              <Text style={styles.juzCount}>
                {memorizedJuz} من {TOTAL_JUZ} جزء
              </Text>
            </TouchableOpacity>

            <View style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <Target
                  size={20}
                  color={colors.gold}
                  strokeWidth={2.2}
                  pointerEvents="none"
                />
                <Text style={styles.goalTitle}>{goalLabel}</Text>
              </View>
              {goalJuz ? (
                <View style={styles.goalBarRow}>
                  <Text style={styles.goalBarPct}>{goalPct}%</Text>
                  <View style={styles.goalTrack}>
                    <View style={[styles.goalFill, { width: `${goalPct}%` }]} />
                  </View>
                </View>
              ) : null}
            </View>

            <StatCard
              layout="inline"
              icon="folder-outline"
              iconColor={colors.primary}
              borderColor={colors.borderGreen}
              label="البرامج النشطة"
              value={activePrograms}
              valueColor={colors.primary}
            />
            <StatCard
              layout="inline"
              icon="book-outline"
              iconColor={colors.gold}
              borderColor={colors.borderGold}
              label="مجموع الأحزاب"
              value={totalAhzab}
              valueColor={colors.gold}
            />

            {adminAlerts.length > 0 ? (
              <SectionCard title="الإشعارات">
                {adminAlerts.map((n) => (
                  <View key={n.id} style={styles.notifItem}>
                    <Text style={styles.notifTitle}>تنبيه من الإدارة</Text>
                    <Text style={styles.notifBody}>{n.message}</Text>
                  </View>
                ))}
              </SectionCard>
            ) : null}

            <SectionCard
              title="آخر النشاطات"
              subtitle="آخر ما قمت به في التطبيق"
            >
              {activitiesLoading && recentActivities.length === 0 ? (
                <View style={styles.activityLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : recentActivities.length === 0 ? (
                <EmptyState text="لا يوجد نشاط بعد — حدّث تقدمك أو سجّل في موسم" />
              ) : (
                recentActivities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    onPress={
                      activity.action
                        ? () => handleActivityPress(activity)
                        : undefined
                    }
                  />
                ))
              )}
            </SectionCard>
          </>
        )}

        {tab === "programs" && <MemberProgramsPanel navigation={navigation} />}

        {tab === "registration" && (
          <MemberRegistrationPanel
            openRegular={openRegular}
            openSummer={openSummer}
            selectedTimes={selectedTimes}
            setSelectedTimes={setSelectedTimes}
            summerTimes={summerTimes}
            setSummerTimes={setSummerTimes}
            onSubmit={handleRegister}
          />
        )}

        {tab === "profile" && (
          <View>
            {sessionState.loading && !contactFields.phone ? (
              <ActivityIndicator
                color={colors.primary}
                style={styles.profileLoader}
              />
            ) : null}

            <ProfileHero
              firstName={currentUser?.firstName}
              fullName={fullName}
            />

            <View style={styles.profileCards}>
              <ProfileInfoCard
                email={currentUser?.email || null}
                gender={displayGenderFromUser(currentUser?.gender)}
                phone={contactFields.phone}
                school={contactFields.school}
                level={contactFields.level}
                hifzAmount={contactFields.hifzAmount}
                onEdit={() => setEditInfoModal(true)}
              />

              <SessionCard
                groupName={sessionState.groupName}
                jour={sessionState.jour}
                heureDebut={sessionState.heureDebut}
                registrationDate={sessionState.registrationDate}
              />

              <ProgressCard
                progressState={profileProgressState}
                onUpdate={openProgression}
              />

              <AttendanceCard
                key={`${authId || ""}_${sessionState.seanceId || ""}`}
                presenceState={presenceState}
              />

              <ProfilePasswordCard onChange={() => setPasswordModal(true)} />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomWrap}>
        <MemberBottomTabBar tabs={TABS} activeKey={tab} onChange={setTab} />
        <TouchableOpacity
          style={[styles.fab, { bottom: 70 + Math.max(insets.bottom, 16) }]}
          onPress={openChat}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-ellipses" size={24} color="white" />
          {messagesUnread > 0 ? (
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>
                {formatUnreadBadge(messagesUnread)}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ChangePasswordModal
        visible={passwordModal}
        onClose={() => setPasswordModal(false)}
        bottomInset={Math.max(insets.bottom, 16)}
      />

      <EditProfileInfoModal
        visible={editInfoModal}
        onClose={() => setEditInfoModal(false)}
        onSaved={handleProfileInfoSaved}
        authId={authId}
        email={currentUser?.email || null}
        gender={displayGenderFromUser(currentUser?.gender)}
        hifzAmount={contactFields.hifzAmount}
        phone={contactFields.phone}
        school={contactFields.school}
        level={contactFields.level}
        bottomInset={Math.max(insets.bottom, 16)}
      />
    </SafeAreaView>
  );
}

function ActivityCard({ activity, onPress }) {
  const when = formatActivityWhen(activity.at);
  const content = (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: `${activity.color}18` }]}>
        <Ionicons name={activity.icon} size={20} color={activity.color} />
      </View>
      <View style={styles.activityBody}>
        <View style={styles.activityHead}>
          <Text style={styles.activityTitle}>{activity.title}</Text>
          {when ? <Text style={styles.activityWhen}>{when}</Text> : null}
        </View>
        <Text style={styles.activityText} numberOfLines={2}>
          {activity.body}
        </Text>
      </View>
      {onPress ? (
        <Ionicons name={arrowForward} size={18} color={colors.muted} />
      ) : null}
    </View>
  );

  if (!onPress) {
    return <View style={styles.activityCard}>{content}</View>;
  }
  return (
    <TouchableOpacity
      style={styles.activityCard}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  header: {
    borderRadius: radii.lg,
    overflow: "hidden",
    paddingTop: 18,
    paddingBottom: 22,
    paddingHorizontal: 18,
  },
  headerRow: {
    flexDirection: row,
    alignItems: "center",
  },
  headerTextWrap: {
    flex: 1,
    alignItems: alignEdge,
  },
  headerGreeting: {
    color: "white",
    fontSize: 19,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    marginTop: 4,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  headerBtn: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
  },
  headerEnd: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  headerIconWrap: { position: "relative", padding: 2 },
  headerBellBadge: {
    position: "absolute",
    top: -4,
    left: -6,
    backgroundColor: colors.red,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  headerBellBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: fonts.bold,
  },

  scroll: {
    padding: 16,
  },

  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: 20,
    alignItems: "center",
    marginBottom: 12,
    ...shadows.card,
  },
  ringInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: radii.sm,
  },
  ringPct: {
    fontSize: radii.lg + radii.sm,
    fontFamily: fonts.bold,
    color: colors.primary,
    ...rtlTextCenter,
  },
  ringSubLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    textAlign: "center",
    ...rtlText,
  },
  juzCount: {
    color: colors.muted,
    fontSize: 14,
    fontFamily: fonts.regular,
    marginTop: 10,
    ...rtlText,
  },
  goalCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  goalHeader: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  goalTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    ...rtlText,
  },
  goalBarRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  goalBarPct: {
    minWidth: 36,
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  goalTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  goalFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignSelf: "flex-end",
  },
  heroLabel: {
    color: colors.muted,
    fontSize: 14,
    fontFamily: fonts.regular,
    marginTop: 6,
    ...rtlText,
  },

  activityLoading: {
    paddingVertical: 20,
    alignItems: "center",
  },
  activityCard: {
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.soft,
  },
  activityRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  activityBody: {
    flex: 1,
  },
  activityHead: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  activityTitle: {
    flex: 1,
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 14,
    ...rtlText,
  },
  activityWhen: {
    color: colors.muted,
    fontSize: 11,
    ...rtlText,
  },
  activityText: {
    color: colors.muted,
    fontSize: 13,
    ...rtlText,
  },

  programCard: {
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.soft,
  },
  programTop: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  programTitleWrap: {
    flex: 1,
    marginEnd: 8,
  },
  programName: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 15,
    ...rtlText,
  },
  goalRow: {
    flexDirection: row,
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  goalStat: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  goalStatLabel: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 4,
    ...rtlText,
  },
  goalStatValue: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 12,
    textAlign: "center",
    ...rtlText,
  },
  goalDoneValue: {
    color: colors.primary,
  },
  goalRemainValue: {
    color: colors.orange,
  },
  goalInput: {
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg,
    ...rtlText,
  },
  programStatusBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusProgress: {
    backgroundColor: "#FFF7E6",
    borderColor: "#FDE68A",
  },
  programStatusText: {
    fontSize: 11,
    fontWeight: "600",
    ...rtlText,
  },
  statusDoneText: { color: colors.primaryDark },
  statusProgressText: { color: colors.orange },
  progressHead: {
    flexDirection: row,
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 6,
  },
  pct: { color: colors.primary, fontWeight: "bold", ...rtlText },
  progressTrack: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignSelf: "flex-end",
  },
  programFooter: {
    flexDirection: row,
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 10,
    gap: 4,
  },
  programOpen: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },

  notifItem: {
    borderWidth: 1,
    borderColor: colors.borderGreen,
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  notifTitle: {
    ...rtlText,
    fontWeight: "bold",
    color: colors.primary,
    marginBottom: 4,
  },
  notifBody: { ...rtlText, color: colors.muted, fontSize: 13 },
  profileCards: {
    gap: 14,
  },
  profileLoader: { marginVertical: 8 },

  bottomWrap: {},
  fab: {
    position: "absolute",
    end: 8,
    bottom: 78,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  fabBadge: {
    position: "absolute",
    top: -2,
    end: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.gold,
    justifyContent: "center",
    alignItems: "center",
  },
  fabBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontFamily: fonts.bold,
  },
});