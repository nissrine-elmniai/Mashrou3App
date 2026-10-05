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
import { Home, BookOpen, User, ClipboardList, GraduationCap } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import {
  getMyProgress,
  getMyCurrentProgressPosition,
  computeProgressMetrics,
  computeProgressPace,
  PROGRESS_LOCKED_MESSAGE,
} from "../../lib/progressApi";
import { SEASON_TYPES } from "../../constants/roles";
import { NOTIF_CATEGORY } from "../../constants/notifications";
import { getActiveRegularSeason, getOpenRegistrationSeasons } from "../../lib/seasonScope";
import { getMyObjectif } from "../../lib/objectifsApi";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, rtlTextCenter, row, fonts } from "../../constants/rtl";
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
  resolveMemberSeasonAlertCutoff,
} from "../../lib/alertsApi";
import {
  getMemberProfileFields,
  formatGenderLabel,
  getMyActiveEnrollment,
} from "../../lib/membersApi";
import {
  getMyCurrentInscription,
  formatUnreadBadge,
  sumMemberInboxUnread,
} from "../../lib/messagesApi";
import { useInboxThreads } from "../../hooks/useInboxThreads";
import { useChatGroups } from "../../hooks/useChatGroups";
import { getMemberPresenceSummary } from "../../lib/presenceApi";
import { getMyTestInvitations, getMyTestResults, mapMemberTestToExam } from "../../lib/testsApi";
import MemberTestsPanel from "../../components/member/MemberTestsPanel";
import { formatHizbCount, tumunStoredToUi, TUMUNS_PER_HIZB } from "../../lib/tumun";
import PersonalInfoSection from "../../components/PersonalInfoSection";
import ProfileHero from "../../components/profile/ProfileHero";
import ProfilePasswordCard from "../../components/profile/ProfilePasswordCard";
import ProfileNotificationsCard from "../../components/profile/ProfileNotificationsCard";
import SessionCard from "../../components/profile/SessionCard";
import ProgressCard from "../../components/profile/ProgressCard";
import AttendanceCard from "../../components/profile/AttendanceCard";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import EditPersonalInfoModal from "../../components/profile/EditPersonalInfoModal";
import ProfileAvatar from "../../components/ProfileAvatar";
import { useUnreadNotifications } from "../../hooks/useUnreadNotifications";
import MemberProgramsPanel from "./MemberProgramsPanel";
import MemberRegistrationPanel from "./MemberRegistrationPanel";

/** Genre depuis currentUser uniquement — pas de fetch member_applications. */
function displayGenderFromUser(gender) {
  const raw = String(gender || "").trim();
  if (!raw || raw === "غير محدد") return null;
  return formatGenderLabel(raw) || null;
}

/**
 * Phrases complètes féminin / masculin.
 * طلب et قبول gardent le suffixe كاف : ces deux types ne changent pas.
 */
function memberActivityPhrases(gender) {
  const female = displayGenderFromUser(gender) === "أنثى";
  const k = female ? "كِ" : "ك";
  return {
    progressTitle: "تقدّم جديد في الحفظ",
    progressBody: (hizb, tumun) =>
      female
        ? `وصلتِ إلى الحزب ${hizb} – الثمن ${tumun}`
        : `وصلتَ إلى الحزب ${hizb} – الثمن ${tumun}`,
    progressKhatma: female
      ? "أتممتِ حفظ القرآن الكريم"
      : "أتممتَ حفظ القرآن الكريم",
    regCreate: `تم إرسال طلب${k}`,
    regAccept: `تم قبول${k}`,
    seanceTitle: female
      ? "مرحبًا بكِ في حصتكِ الجديدة"
      : "مرحبًا بك في حصتك الجديدة",
    presentTitle: female ? "تم تسجيل حضوركِ" : "تم تسجيل حضورك",
    absentTitle: female ? "تم تسجيل غيابكِ" : "تم تسجيل غيابك",
    examTitle: (titre) => {
      const t = String(titre || "").trim();
      if (!t || t === "اختبار") return "نتيجة الاختبار";
      return `نتيجة ${t}`;
    },
    examBody: (note) =>
      female ? `حصلتِ على ${note}/20` : `حصلتَ على ${note}/20`,
  };
}

/** « صباحًا » avant midi, « مساءً » à partir de 12:00. Vide si l'heure est illisible. */
function periodFromHeure(heureDebut) {
  const match = String(heureDebut || "").trim().match(/^(\d{1,2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  if (!Number.isFinite(hours) || hours > 23) return "";
  return hours < 12 ? "صباحًا" : "مساءً";
}

/**
 * Créneau de la séance actuelle.
 * withHissa : « حصة الخميس مساءً ». Sans : « الخميس مساءً ».
 * Réduit à ce qui existe ; vide si jour et heure manquent.
 */
function sessionActivitySubtitle(jour, heureDebut, withHissa) {
  const day = String(jour || "").trim();
  const period = periodFromHeure(heureDebut);
  const parts = [day, period].filter(Boolean);
  if (!parts.length) return "";
  const core = parts.join(" ");
  return withHissa ? `حصة ${core}` : core;
}

/**
 * Position affichée pour une activité de progression.
 * n = hizb terminés, r = reste stocké 0–7.
 * Convention : reste 0 = thumn 8 du hizb terminé, pas le début du hizb suivant.
 * @returns {{ kind: "skip" } | { kind: "khatma" } | { kind: "position", hizb: number, tumun: number }}
 */
function progressActivityPosition(nRaw, rRaw) {
  const n = Number.isFinite(Number(nRaw)) ? Math.max(0, Math.floor(Number(nRaw))) : 0;
  const r = Number.isFinite(Number(rRaw)) ? Math.max(0, Math.floor(Number(rRaw))) : 0;
  if (n >= 60) return { kind: "khatma" };
  if (n === 0 && r === 0) return { kind: "skip" };
  if (r >= 1 && r <= 7) {
    return { kind: "position", hizb: Math.min(60, n + 1), tumun: r };
  }
  return { kind: "position", hizb: n, tumun: tumunStoredToUi(0) };
}

/** 16 et non 16.0 ; 15.5 conservé. Vide si la note n'est pas un nombre. */
function formatActivityNote(score) {
  if (score == null || String(score).trim() === "") return "";
  const n = Number(score);
  if (!Number.isFinite(n)) return "";
  return String(parseFloat(n.toFixed(10)));
}

const alignEdge = I18nManager.isRTL ? "flex-start" : "flex-end";
const LRI = "\u2066";
const PDI = "\u2069";

/**
 * Pourcentage d'anneau (0–100). Une décimale ;
 * 0 % et 100 % sans décimale. Isolat LTR pour le point et « % ».
 */
function formatRingPercent(rawPct) {
  const raw = Math.min(100, Math.max(0, Number(rawPct) || 0));
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

/** Position en أحزاب depuis les أثمان, sans arrondi à l'entier supérieur. */
function formatHizbAmount(tumunTotal) {
  const h = (Number(tumunTotal) || 0) / TUMUNS_PER_HIZB;
  const one = Math.round(h * 10) / 10;
  if (one === Math.floor(one)) return String(one);
  return one.toFixed(1);
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

/** Mois marocains (même liste que format_date_ar). Locale à cet écran. */
const ACTIVITY_MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "ماي",
  "يونيو",
  "يوليوز",
  "غشت",
  "شتنبر",
  "أكتوبر",
  "نونبر",
  "دجنبر",
];

function formatActivityDate(date, currentYear) {
  const day = date.getDate();
  const month = ACTIVITY_MONTHS_AR[date.getMonth()] || "";
  const year = date.getFullYear();
  if (year !== currentYear) return `${day} ${month} ${year}`;
  return `${day} ${month}`;
}

/** Minutes / heures sous 24 h. Au-delà, le barème calendaire reprend. */
function formatActivityElapsed(diffMin) {
  if (diffMin < 1) return "منذ لحظات";
  if (diffMin < 60) {
    if (diffMin === 1) return "منذ دقيقة";
    if (diffMin === 2) return "منذ دقيقتين";
    if (diffMin <= 10) return `منذ ${diffMin} دقائق`;
    return `منذ ${diffMin} دقيقة`;
  }
  const diffH = Math.floor(diffMin / 60);
  if (diffH <= 1) return "منذ ساعة";
  if (diffH === 2) return "منذ ساعتين";
  if (diffH <= 10) return `منذ ${diffH} ساعات`;
  return `منذ ${diffH} ساعة`;
}

/**
 * Colonne de gauche des activités uniquement.
 * Sous 24 h : toujours minutes/heures, même si la date calendaire est la veille.
 * « أمس » seulement si l'écart atteint 24 h et que le jour calendaire est la veille.
 */
function formatActivityWhen(ts) {
  if (!ts) return "";
  const then = new Date(ts);
  if (Number.isNaN(then.getTime())) return "";
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (diffMin < 24 * 60) return formatActivityElapsed(diffMin);

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfDay(now).getTime() - startOfDay(then).getTime()) / 86400000
  );
  if (dayDiff >= 7) return formatActivityDate(then, now.getFullYear());
  if (dayDiff === 1) return "أمس";
  if (dayDiff === 2) return "منذ يومين";
  if (dayDiff >= 3) return `منذ ${dayDiff} أيام`;
  return formatActivityElapsed(diffMin);
}

const TABS = [
  { key: "home", label: "الرئيسية", icon: Home },
  { key: "programs", label: "برامجي", icon: BookOpen },
  { key: "tests", label: "الاختبارات", icon: GraduationCap },
  { key: "registration", label: "التسجيل", icon: ClipboardList },
  { key: "profile", label: "ملفي", icon: User },
];

export default function MemberDashboardScreen({ navigation, route }) {
  const {
    currentUser,
    seasons,
    registrations,
    logout,
    submitSeasonRegistration,
    getNotificationsForUser,
    getMenuBadgeCounts,
    markCategoryNotificationsRead,
    notifications,
    getMemberPrograms,
    updateCurrentUserAvatar,
  } = useApp();

  const authId = currentUser?.authId || currentUser?.id || null;
  const { threads } = useInboxThreads();
  const { groups: chatGroups } = useChatGroups();
  const { count: unreadNotifCount } = useUnreadNotifications();

  const [tab, setTab] = useState("home");
  const [adminAlerts, setAdminAlerts] = useState([]);
  const [pendingAlertCount, setPendingAlertCount] = useState(0);
  const [progressEntries, setProgressEntries] = useState([]);
  const [currentMetrics, setCurrentMetrics] = useState(null);
  const [positionReady, setPositionReady] = useState(false);
  const [progressLocked, setProgressLocked] = useState(false);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  /** Timestamp ms — ne montrer que les activités >= date d'inscription */
  const [activitySinceMs, setActivitySinceMs] = useState(null);
  const [activityCutoffReady, setActivityCutoffReady] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [editInfoModal, setEditInfoModal] = useState(false);
  const [seasonObjectif, setSeasonObjectif] = useState(null);
  const [memberInfo, setMemberInfo] = useState(null);
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
    superviseurId: null,
    registrationDate: null,
  });
  const [progressState, setProgressState] = useState({
    loading: false,
    error: null,
    hasData: false,
    metrics: null,
    note: null,
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
  const [myExams, setMyExams] = useState([]);
  const [testsInviteCount, setTestsInviteCount] = useState(0);
  const [highlightInvitationId, setHighlightInvitationId] = useState(null);

  const messagesUnread = useMemo(
    () =>
      sumMemberInboxUnread(threads, chatGroups, sessionState.superviseurId),
    [threads, chatGroups, sessionState.superviseurId]
  );
  const headerBadgeCount = pendingAlertCount + unreadNotifCount;

  const activeSeasonId = getActiveRegularSeason(seasons)?.id || null;

  const loadProgressEntries = useCallback(async () => {
    setActivitiesLoading(true);
    const [res, posRes, enrollRes] = await Promise.all([
      getMyProgress({
        saisonId: activeSeasonId || undefined,
      }),
      getMyCurrentProgressPosition(),
      getMyActiveEnrollment(),
    ]);
    if (res.ok) {
      setProgressEntries(res.entries || []);
    }
    if (posRes.ok) {
      setCurrentMetrics(posRes.hasData ? posRes.metrics : null);
    }
    if (enrollRes.ok) setProgressLocked(!enrollRes.enrolled);
    setPositionReady(true);
    setActivitiesLoading(false);
  }, [activeSeasonId]);

  useFocusEffect(
    useCallback(() => {
      loadProgressEntries();
    }, [loadProgressEntries])
  );

  const loadMyExams = useCallback(async () => {
    const res = await getMyTestResults();
    if (!res.ok) {
      setMyExams([]);
      return;
    }
    setMyExams((res.results || []).map(mapMemberTestToExam));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMyExams();
    }, [loadMyExams])
  );

  const loadTestsBadge = useCallback(async () => {
    const res = await getMyTestInvitations();
    if (!res.ok) return;
    setTestsInviteCount(
      (res.invitations || []).filter((row) => row.statut === "invite").length
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTestsBadge();
    }, [loadTestsBadge])
  );

  useEffect(() => {
    const nextTab = route?.params?.tab;
    const nextId = route?.params?.invitationId;
    if (!nextTab && !nextId) return;
    if (nextTab) setTab(nextTab);
    if (nextId) setHighlightInvitationId(String(nextId));
    navigation.setParams({ tab: undefined, invitationId: undefined });
  }, [navigation, route?.params?.tab, route?.params?.invitationId]);

  const loadAlerts = useCallback(async () => {
    const scope = {
      scopeToCurrentSeason: true,
      saisonId: activeSeasonId,
      role: "member",
    };
    const [visible, pending] = await Promise.all([
      getVisibleAlerts({ ...scope, limit: 3 }),
      getUnacknowledgedAlerts(scope),
    ]);
    if (visible.ok) setAdminAlerts(visible.alerts);
    if (pending.ok) setPendingAlertCount(pending.alerts.length);
  }, [activeSeasonId]);

  useEffect(() => {
    loadAlerts();
    return subscribeToNewAlerts(() => loadAlerts());
  }, [loadAlerts]);

  useFocusEffect(
    useCallback(() => {
      loadAlerts();
    }, [loadAlerts])
  );

  useEffect(() => {
    if (!authId || !activeSeasonId) {
      setActivitySinceMs(null);
      setActivityCutoffReady(!!authId && !activeSeasonId);
      return undefined;
    }
    let cancelled = false;
    setActivityCutoffReady(false);
    (async () => {
      const res = await resolveMemberSeasonAlertCutoff(authId, activeSeasonId);
      if (cancelled) return;
      if (res.ok && res.sinceIso) {
        const ms = new Date(res.sinceIso).getTime();
        setActivitySinceMs(Number.isFinite(ms) ? ms : null);
      } else {
        setActivitySinceMs(null);
      }
      setActivityCutoffReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authId, activeSeasonId]);

  const openRegular = getOpenRegistrationSeasons(seasons, SEASON_TYPES.REGULAR);
  const openSummer = getOpenRegistrationSeasons(seasons, SEASON_TYPES.SUMMER);

  const myRegs = registrations.filter((r) => {
    if (!currentUser) return false;
    if (r.userId && r.userId === currentUser.id) return true;
    const mail = String(r.email || "").trim().toLowerCase();
    const mine = String(currentUser.email || "").trim().toLowerCase();
    return !!(mail && mine && mail === mine);
  });

  const activeRegular =
    seasons.find((s) => s.active && s.type === SEASON_TYPES.REGULAR) ||
    seasons.find((s) => s.type === SEASON_TYPES.REGULAR);
  const activeSummer =
    seasons.find((s) => s.active && s.type === SEASON_TYPES.SUMMER) ||
    seasons.find((s) => s.type === SEASON_TYPES.SUMMER);

  const loadSeasonObjectif = useCallback(async () => {
    const memberId = currentUser?.authId || currentUser?.id;
    const saisonId = getActiveRegularSeason(seasons)?.id ?? null;
    if (!memberId || !saisonId) {
      setSeasonObjectif(null);
      return;
    }
    const res = await getMyObjectif(saisonId);
    if (res.ok && res.objectif) {
      setSeasonObjectif(res.objectif);
    } else {
      setSeasonObjectif(null);
    }
  }, [currentUser?.authId, currentUser?.id, seasons]);

  useFocusEffect(
    useCallback(() => {
      loadSeasonObjectif();
    }, [loadSeasonObjectif])
  );

  const loadProfileData = useCallback(async () => {
    if (!authId) {
      setMemberInfo(null);
      setSessionState({
        loading: false,
        groupName: null,
        jour: null,
        heureDebut: null,
        seanceId: null,
        saisonId: null,
        superviseurId: null,
        registrationDate: null,
      });
      setProgressState({
        loading: false,
        error: null,
        hasData: false,
        metrics: null,
        note: null,
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

    const [fieldsRes, currentInscRes] = await Promise.all([
      getMemberProfileFields(authId),
      getMyCurrentInscription(authId),
    ]);

    if (fieldsRes.ok) {
      setMemberInfo(fieldsRes);
      setContactFields({
        phone: fieldsRes.telephone || currentUser?.phone || null,
        school: fieldsRes.ecole || currentUser?.school || null,
        level: fieldsRes.niveau || currentUser?.level || null,
        hifzAmount: fieldsRes.quantiteHifz || currentUser?.hifzAmount || null,
      });
    }

    const seance = currentInscRes.ok ? currentInscRes.seance : null;
    const inscription = currentInscRes.ok ? currentInscRes.inscription : null;
    const seanceId = seance?.id || null;
    const saisonId = seance?.saison_id || inscription?.saisonId || null;

    setSessionState({
      loading: false,
      groupName: seance?.nom || null,
      jour: seance?.jour || null,
      heureDebut: seance?.heure_debut || null,
      heureFin: seance?.heure_fin || null,
      seanceId,
      saisonId,
      superviseurId: seance?.superviseur_id || null,
      registrationDate: inscription?.dateInscription || null,
    });

    setProgressState((s) => ({
      ...s,
      loading: false,
      error: null,
    }));

    // Pas de séance du musim courant : ne pas charger la présence.
    if (!seanceId) {
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

    const presRes = await getMemberPresenceSummary(authId, seanceId);

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

  const handleProfileInfoSaved = useCallback(async () => {
    await loadProfileData();
  }, [loadProfileData]);

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

  const myMemberPrograms = getMemberPrograms();

  const activePrograms = myMemberPrograms.length;

  const memorizationMetrics = currentMetrics;

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
        !memorizationMetrics &&
        (activitiesLoading || !positionReady || progressState.loading),
      error: progressState.error,
      hasData: !!memorizationMetrics,
      metrics: memorizationMetrics,
      note: memorizationMetrics?.notes || null,
      objectif: seasonObjectif,
      seasonDeltaTumuns: progressPace.seasonDeltaTumuns,
      weekDeltaTumuns: progressPace.weekDeltaTumuns,
    }),
    [
      memorizationMetrics,
      activitiesLoading,
      positionReady,
      progressState.loading,
      progressState.error,
      seasonObjectif,
      progressPace,
    ]
  );

  /** Anneau = incrément saison (position actuelle − départ) / objectif visé. */
  const homeProgress = useMemo(() => {
    const goal = seasonObjectif;
    const nbHizbCible = Number(goal?.nbHizbCible);
    const hasObjectif = Number.isInteger(nbHizbCible) && nbHizbCible >= 1;
    const tumunTotal = memorizationMetrics?.tumunTotal ?? 0;

    if (!hasObjectif) {
      // Pas de 0 % : l'anneau reste vide, le centre affiche « — ».
      return {
        memorizationPct: 0,
        memorizationPctLabel: "—",
        programsHizbLabel: "لم يُحدد هدف لهذا الموسم بعد",
        ringA11y: "لم يُحدد هدف لهذا الموسم بعد. اضغط لتحديد عدد الأحزاب.",
      };
    }

    const departRaw = Number(goal?.nbHizbDepart);
    const nbHizbDepart =
      Number.isInteger(departRaw) && departRaw >= 0 ? departRaw : 0;
    const numerateur = Math.max(
      0,
      tumunTotal - nbHizbDepart * TUMUNS_PER_HIZB
    );
    const denom = nbHizbCible * TUMUNS_PER_HIZB;
    const rawPct = denom > 0 ? (numerateur / denom) * 100 : 0;
    const ring = formatRingPercent(rawPct);
    const gainedLabel = formatHizbAmount(numerateur);
    const cibleLabel = formatHizbCount(nbHizbCible);
    return {
      memorizationPct: ring.progress,
      memorizationPctLabel: ring.label,
      programsHizbLabel: `${gainedLabel} من ${cibleLabel}`,
      ringA11y: `تقدم هدف الموسم: ${gainedLabel} من ${cibleLabel}`,
    };
  }, [seasonObjectif, memorizationMetrics]);

  const { memorizationPct, memorizationPctLabel, programsHizbLabel, ringA11y } =
    homeProgress;

  const userNotifications = useMemo(
    () => getNotificationsForUser(currentUser),
    [currentUser, getNotificationsForUser, notifications]
  );

  const memberMenuBadges = useMemo(() => {
    const sinceIso =
      Number.isFinite(activitySinceMs) && activitySinceMs > 0
        ? new Date(activitySinceMs).toISOString()
        : null;
    return getMenuBadgeCounts(currentUser, {
      saisonId: activeSeasonId,
      sinceIso,
    });
  }, [
    getMenuBadgeCounts,
    currentUser,
    activeSeasonId,
    activitySinceMs,
    notifications,
  ]);

  const tabsWithBadges = useMemo(
    () =>
      TABS.map((t) => {
        if (t.key === "registration") {
          return {
            ...t,
            badgeCount: memberMenuBadges[NOTIF_CATEGORY.REGISTRATION] || 0,
          };
        }
        if (t.key === "tests") {
          return { ...t, badgeCount: testsInviteCount };
        }
        return t;
      }),
    [memberMenuBadges, testsInviteCount]
  );

  const handleTabChange = useCallback(
    (nextTab) => {
      if (nextTab === "registration") {
        const sinceIso =
          Number.isFinite(activitySinceMs) && activitySinceMs > 0
            ? new Date(activitySinceMs).toISOString()
            : null;
        markCategoryNotificationsRead(
          NOTIF_CATEGORY.REGISTRATION,
          currentUser,
          { saisonId: activeSeasonId, sinceIso }
        );
      }
      setTab(nextTab);
    },
    [
      activitySinceMs,
      activeSeasonId,
      currentUser,
      markCategoryNotificationsRead,
    ]
  );

  const recentActivities = useMemo(() => {
    const items = [];
    if (!currentUser?.id || !activityCutoffReady) return items;

    const sinceMs = (() => {
      const fromCutoff = Number.isFinite(activitySinceMs) ? activitySinceMs : 0;
      const fromInsc = parseActivityTimestamp(sessionState.registrationDate);
      const candidates = [fromCutoff, fromInsc].filter((n) => n > 0);
      return candidates.length ? Math.min(...candidates) : null;
    })();

    // Saison active sans date d'inscription → aucun historique (nouveau contexte).
    const isAfterRegistration = (at) => {
      if (!at || at <= 0) return false;
      if (activeSeasonId && sinceMs == null) return false;
      if (sinceMs == null) return true;
      return at >= sinceMs;
    };

    const phrases = memberActivityPhrases(currentUser?.gender);

    progressEntries.forEach((entry, idx) => {
      const entrySeason = entry.saison_id || entry.saisonId || null;
      if (activeSeasonId && entrySeason && entrySeason !== activeSeasonId) {
        return;
      }
      const metrics = computeProgressMetrics(entry);
      // r vient de la colonne stockée : metrics.tumunCourant est null quand le reste est 0.
      const position = progressActivityPosition(
        metrics?.nbHizbCompletes ?? entry.nb_hizb_completes,
        entry.tumun_courant
      );
      if (position.kind === "skip") return;
      const at = parseActivityTimestamp(
        entry.date || entry.date_saisie || entry.created_at
      );
      if (!isAfterRegistration(at)) return;
      items.push({
        id: `progress-${entry.id || idx}`,
        at,
        title: phrases.progressTitle,
        body:
          position.kind === "khatma"
            ? phrases.progressKhatma
            : phrases.progressBody(position.hizb, position.tumun),
        icon: "book-outline",
        color: colors.primary,
        action: "progress",
      });
    });

    myRegs.forEach((r) => {
      if (activeSeasonId && r.seasonId && r.seasonId !== activeSeasonId) {
        return;
      }
      const season = seasons.find((s) => s.id === r.seasonId);
      const atAccepted = parseActivityTimestamp(r.acceptedAt);
      const atCreated = parseActivityTimestamp(r.createdAt);
      if (isAfterRegistration(atCreated)) {
        items.push({
          id: `reg-create-${r.id}`,
          at: atCreated,
          title: phrases.regCreate,
          body: season?.name || "موسم",
          icon: "document-text-outline",
          color: colors.orange,
          action: "registration",
        });
      }
      if (atAccepted > 0 && isAfterRegistration(atAccepted)) {
        items.push({
          id: `reg-accept-${r.id}`,
          at: atAccepted,
          title: phrases.regAccept,
          body: season?.name || "موسم",
          icon: "checkmark-circle-outline",
          color: colors.primary,
          action: "registration",
        });
      }
    });

    if (sessionState.registrationDate && sessionState.groupName) {
      const at = parseActivityTimestamp(sessionState.registrationDate);
      if (isAfterRegistration(at)) {
        items.push({
          id: "seance-assign",
          at,
          title: phrases.seanceTitle,
          body: sessionActivitySubtitle(sessionState.jour, sessionState.heureDebut, false),
          icon: "people-outline",
          color: colors.teal || colors.primary,
          action: "profile",
        });
      }
    }

    // Présence et absence : séance ACTUELLE (sessionState), pas la séance
    // historique de la date. Limite connue.
    const presenceBody = sessionActivitySubtitle(
      sessionState.jour,
      sessionState.heureDebut,
      true
    );
    (presenceState.records || []).slice(0, 12).forEach((r, idx) => {
      const at = parseActivityTimestamp(r.date);
      if (!isAfterRegistration(at)) return;
      const present = r.status === "present";
      items.push({
        id: `presence-${r.date || idx}`,
        at,
        title: present ? phrases.presentTitle : phrases.absentTitle,
        body: presenceBody,
        icon: present ? "checkmark-outline" : "close-outline",
        color: present ? colors.primary : colors.orange,
        action: "profile",
      });
    });

    myExams.forEach((e) => {
      if (e.score == null || String(e.score).trim() === "") return;
      const at = parseActivityTimestamp(e.date);
      if (!isAfterRegistration(at)) return;
      const note = formatActivityNote(e.score);
      if (!note) return;
      items.push({
        id: `exam-${e.id}`,
        at,
        title: phrases.examTitle(e.title),
        body: phrases.examBody(note),
        icon: "school-outline",
        color: colors.gold,
        action: "tests",
      });
    });

    userNotifications
      .filter((n) => n.audience === "user" && n.userId === currentUser.id)
      .forEach((n) => {
        const at = parseActivityTimestamp(n.createdAt);
        if (!isAfterRegistration(at)) return;
        items.push({
          id: `notif-${n.id}`,
          at,
          title: n.title,
          body: n.body,
          icon: "notifications-outline",
          color: colors.primaryDark,
          action: null,
        });
      });

    return items.sort((a, b) => b.at - a.at).slice(0, 8);
  }, [
    currentUser?.id,
    currentUser?.gender,
    activityCutoffReady,
    activitySinceMs,
    activeSeasonId,
    sessionState.registrationDate,
    sessionState.groupName,
    sessionState.jour,
    sessionState.heureDebut,
    progressEntries,
    myRegs,
    myExams,
    seasons,
    userNotifications,
    presenceState.records,
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
        },
      },
    ]);
  };

    const handleRegister = async (payload) => {
    const result = await submitSeasonRegistration(payload);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return result;
    }
    Alert.alert("تم", "تم إرسال طلب التسجيل");
    return result;
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
    if (activity.action === "tests") {
      setTab("tests");
      return;
    }
    if (activity.action === "profile") {
      setTab("profile");
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
              {tab === "home" ? (
                <>
                  <Text style={styles.headerSalam}>السلام عليكم</Text>
                  <Text style={styles.headerGreeting}>
                    {currentUser?.firstName || fullName}
                  </Text>
                </>
              ) : (
                <Text style={styles.headerGreeting}>
                  {tab === "programs"
                    ? "برامجي"
                    : tab === "registration"
                      ? "التسجيل والموسم"
                      : tab === "tests"
                        ? "الاختبارات"
                        : "ملفي"}
                </Text>
              )}
            </View>
            {tab === "programs" ? (
              <Ionicons name="book" size={22} color="white" />
            ) : tab === "registration" ? (
              <Ionicons name="clipboard-outline" size={22} color="white" />
            ) : tab === "tests" ? (
              <Ionicons name="school-outline" size={22} color="white" />
            ) : null}
            {tab === "home" || tab === "profile" ? (
              <View style={styles.headerEnd}>
                <TouchableOpacity style={styles.headerBtn} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={22} color="white" />
                </TouchableOpacity>
                {tab === "home" ? (
                  <>
                    <TouchableOpacity
                      style={styles.headerIconWrap}
                      onPress={() => navigation.navigate("MemberAlerts")}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="الإشعارات"
                    >
                      <Ionicons name="notifications-outline" size={22} color="white" />
                      {headerBadgeCount > 0 ? (
                        <View style={styles.headerBellBadge}>
                          <Text style={styles.headerBellBadgeText}>
                            {headerBadgeCount > 9 ? "9+" : headerBadgeCount}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.profileBtn}
                      onPress={() => setTab("profile")}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="الملف الشخصي"
                    >
                      <ProfileAvatar
                        userId={authId}
                        avatarUrl={currentUser?.avatarUrl}
                        cacheKey={currentUser?.avatarUrl || authId}
                        fallbackLetter={(currentUser?.firstName || fullName || "م").charAt(0)}
                        size={32}
                        softBackgroundColor="rgba(255,255,255,0.28)"
                        letterColor="white"
                        style={styles.profileAvatar}
                      />
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
        </LinearGradient>
      </View>

      {tab === "tests" ? (
        <MemberTestsPanel
          invitationId={highlightInvitationId}
          onInviteCount={setTestsInviteCount}
        />
      ) : (
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
              accessibilityLabel={ringA11y}
            >
              <ProgressRing
                progress={memorizationPct}
                size={148}
                stroke={12}
                color={colors.primary}
              >
                <View style={styles.ringInner} pointerEvents="none">
                  <Text style={styles.ringPct}>{memorizationPctLabel}</Text>
                  <Text
                    style={styles.juzCount}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {programsHizbLabel}
                  </Text>
                </View>
              </ProgressRing>
              <Text style={styles.ringTitle}>هدفي لهذا الموسم</Text>
            </TouchableOpacity>

            <StatCard
              layout="inline"
              icon="book-outline"
              iconColor={colors.primary}
              borderColor={colors.borderGreen}
              label="مجموع الأحزاب المكتملة"
              value={totalAhzab}
              valueColor={colors.primary}
            />

            <StatCard
              layout="inline"
              icon="folder-outline"
              iconColor={colors.gold}
              borderColor={colors.borderGold}
              label="البرامج النشطة"
              value={activePrograms}
              valueColor={colors.gold}
            />

            <SectionCard>
              <AdminAlertsSectionTitle
                alert={adminAlerts[0] || null}
                onPress={() => navigation.navigate("MemberAlerts")}
              />
              {adminAlerts.length === 0 ? (
                <EmptyState text="لا توجد تنبيهات جديدة" />
              ) : (
                adminAlerts.map((n, idx) => {
                  const when = formatActivityWhen(parseActivityTimestamp(n.createdAt));
                  const isLast = idx === adminAlerts.length - 1;
                  return (
                    <View
                      key={n.id}
                      style={[styles.activityRow, !isLast && styles.activityRowBorder]}
                    >
                      <View style={styles.activityBody}>
                        <View style={styles.activityHead}>
                          <Text style={styles.activityTitle} numberOfLines={1}>
                            {n.message}
                          </Text>
                          {when ? <Text style={styles.activityWhen}>{when}</Text> : null}
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </SectionCard>

            <SectionCard title="آخر النشاطات">
              {(activitiesLoading || !activityCutoffReady) &&
              recentActivities.length === 0 ? (
                <View style={styles.activityLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : recentActivities.length === 0 ? (
                <EmptyState text="لا توجد أنشطة حديثة" />
              ) : (
                recentActivities.map((activity, idx) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    isLast={idx === recentActivities.length - 1}
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
            gender={displayGenderFromUser(currentUser?.gender)}
            userId={currentUser?.authId || null}
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
              avatarUrl={currentUser?.avatarUrl}
              editable
              authId={authId}
              onAvatarChanged={updateCurrentUserAvatar}
            />

            <View style={styles.profileCards}>
              <PersonalInfoSection
                member={memberInfo}
                editAction={() => setEditInfoModal(true)}
              />

              <SessionCard
                groupName={sessionState.groupName}
                jour={sessionState.jour}
                heureDebut={sessionState.heureDebut}
                heureFin={sessionState.heureFin}
                registrationDate={sessionState.registrationDate}
              />

              <ProgressCard
                progressState={profileProgressState}
                onUpdate={openProgression}
                lockedMessage={progressLocked ? PROGRESS_LOCKED_MESSAGE : null}
              />

              <AttendanceCard
                key={`${authId || ""}_${sessionState.seanceId || ""}`}
                presenceState={presenceState}
              />

              <ProfilePasswordCard onChange={() => setPasswordModal(true)} />
              <ProfileNotificationsCard
                onPress={() => navigation.navigate("NotificationSettings")}
              />
            </View>
          </View>
        )}
      </ScrollView>
      )}

      <View style={styles.bottomWrap}>
        <MemberBottomTabBar
          tabs={tabsWithBadges}
          activeKey={tab}
          onChange={handleTabChange}
        />
      </View>
      <View
        style={[styles.fabWrap, { bottom: 68 + Math.max(insets.bottom, 16) }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.fab}
          onPress={openChat}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={
            messagesUnread > 0
              ? `الرسائل، ${messagesUnread} غير مقروءة`
              : "الرسائل"
          }
        >
          <Ionicons name="chatbubble-ellipses" size={28} color="white" />
          {messagesUnread > 0 ? (
            <View style={styles.fabBadge} pointerEvents="none">
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

      <EditPersonalInfoModal
        visible={editInfoModal}
        onClose={() => setEditInfoModal(false)}
        onSaved={handleProfileInfoSaved}
        authId={authId}
        member={memberInfo}
        bottomInset={Math.max(insets.bottom, 16)}
      />
    </SafeAreaView>
  );
}

const ALERTS_AVATAR_SIZE = 28;
const ALERTS_TITLE_GAP = 8;
const ALERTS_LINE_LEAD = 10;

/** Filet or : du centre de l'avatar jusqu'à 30 % du titre. */
function AdminAlertsSectionTitle({ alert, onPress }) {
  const [titleWidth, setTitleWidth] = useState(0);
  const lineInset = ALERTS_LINE_LEAD + ALERTS_AVATAR_SIZE / 2;
  const lineWidth = ALERTS_AVATAR_SIZE / 2 + ALERTS_TITLE_GAP + titleWidth * 0.3;

  return (
    <View style={styles.alertsTitleWrap}>
      <TouchableOpacity
        style={styles.alertsTitleRow}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="تنبيهات الإدارة"
      >
        <View style={styles.alertsLineLead} />
        <ProfileAvatar
          userId={alert?.senderId || null}
          avatarUrl={alert?.senderAvatarUrl}
          cacheKey={alert?.senderAvatarUrl || alert?.senderId}
          fallbackLetter={alert?.senderInitial || "إ"}
          size={ALERTS_AVATAR_SIZE}
          softBackgroundColor={colors.primarySoft}
          letterColor={colors.primary}
        />
        <View style={styles.alertsTitleGap} />
        <Text
          style={styles.alertsTitle}
          onLayout={(e) => {
            const next = e.nativeEvent.layout.width;
            setTitleWidth((prev) => (prev === next ? prev : next));
          }}
        >
          تنبيهات الإدارة
        </Text>
      </TouchableOpacity>
      <View
        style={[
          styles.alertsTitleLine,
          { width: lineWidth, marginRight: lineInset },
        ]}
      />
    </View>
  );
}

function ActivityCard({ activity, onPress, isLast }) {
  const when = formatActivityWhen(activity.at);
  const body = String(activity.body || "").trim();
  const content = (
    <View style={[styles.activityRow, !isLast && styles.activityRowBorder]}>
      <View
        style={[styles.activityIcon, { backgroundColor: `${activity.color}18` }]}
      >
        <Ionicons name={activity.icon} size={16} color={activity.color} />
      </View>
      <View style={styles.activityBody}>
        <View style={styles.activityHead}>
          <Text style={styles.activityTitle} numberOfLines={1}>
            {activity.title}
          </Text>
          {when ? <Text style={styles.activityWhen}>{when}</Text> : null}
        </View>
        {body ? (
          <Text style={styles.activityText} numberOfLines={1}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
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
  headerSalam: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    fontFamily: fonts.regular,
    marginBottom: 2,
    ...rtlText,
  },
  headerGreeting: {
    color: "white",
    fontSize: 20,
    fontFamily: fonts.bold,
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
  profileBtn: { padding: 2 },
  profileAvatar: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.9)",
  },
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
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPct: {
    fontSize: radii.lg + radii.sm,
    fontFamily: fonts.bold,
    color: colors.primary,
    ...rtlTextCenter,
  },
  ringTitle: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: fonts.bold,
    marginTop: 10,
    ...rtlTextCenter,
  },
  juzCount: {
    width: "100%",
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.regular,
    marginTop: 2,
    textAlign: "center",
    ...rtlTextCenter,
  },

  alertsTitleWrap: {
    alignItems: alignEdge,
    marginBottom: 4,
  },
  alertsTitleRow: {
    flexDirection: row,
    alignItems: "center",
  },
  alertsLineLead: {
    width: ALERTS_LINE_LEAD,
  },
  alertsTitleGap: {
    width: ALERTS_TITLE_GAP,
  },
  alertsTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.primary,
    ...rtlTextBold,
  },
  alertsTitleLine: {
    height: 3,
    backgroundColor: colors.gold,
    borderRadius: 2,
    marginTop: 6,
    marginBottom: 10,
  },
  activityLoading: {
    paddingVertical: 20,
    alignItems: "center",
  },
  activityRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  activityRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
  },
  activityTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    ...rtlText,
  },
  activityWhen: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  activityText: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 2,
    ...rtlText,
  },

  profileCards: {
    gap: 14,
  },
  avatarBlock: {
    alignItems: "center",
    marginBottom: 4,
  },
  profileName: {
    marginTop: 10,
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    ...rtlText,
  },
  profileLoader: { marginVertical: 8 },

  bottomWrap: {},
  fabWrap: {
    position: "absolute",
    end: 16,
    overflow: "visible",
    zIndex: 20,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
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