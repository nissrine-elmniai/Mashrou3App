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
  getMemberSeasonObjectif,
} from "../../lib/progressApi";
import {
  REGISTRATION_STATUS_LABELS,
  SEASON_TYPES,
  ROLE_LABELS,
} from "../../constants/roles";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, row, arrowForward, fonts } from "../../constants/rtl";
import {
  StatCard,
  SectionCard,
  QuickButton,
  EmptyState,
  MemberBottomTabBar,
} from "../../components/ui";
import { ProgressRing } from "../../components/ProgressRing";
import { getVisibleAlerts, subscribeToNewAlerts } from "../../lib/alertsApi";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import MemberProgramsPanel from "./MemberProgramsPanel";
import MemberRegistrationPanel from "./MemberRegistrationPanel";

const alignEdge = I18nManager.isRTL ? "flex-start" : "flex-end";
const TOTAL_JUZ = 30;
const TOTAL_HIZB = TOTAL_JUZ * 2;

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
    getMemberGroup,
    getNotificationsForUser,
    getMemberPrograms,
  } = useApp();

  const [tab, setTab] = useState("home");
  const [adminAlerts, setAdminAlerts] = useState([]);
  const [progressEntries, setProgressEntries] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [selectedTimes, setSelectedTimes] = useState([]);
  const [summerTimes, setSummerTimes] = useState([]);
  const [passwordModal, setPasswordModal] = useState(false);
  const [seasonObjectif, setSeasonObjectif] = useState("");

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await getVisibleAlerts();
      if (!cancelled && res.ok) setAdminAlerts(res.alerts);
    };
    load();
    const unsub = subscribeToNewAlerts(() => {
      load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

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

  const myGroup = getMemberGroup(currentUser?.id, activeRegular?.id);
  const myExams = exams.filter((e) => e.memberId === currentUser?.id);
  const myMemberPrograms = getMemberPrograms();

  const activePrograms = myMemberPrograms.length;
  const totalAhzab = myMemberPrograms.reduce(
    (sum, program) =>
      sum + Math.round((program.nbHizb || 0) * (program.progression || 0) / 100),
    0
  );

  const memorizationMetrics = useMemo(() => {
    if (!progressEntries.length) return null;
    const sorted = [...progressEntries].sort((a, b) => {
      const ta = parseActivityTimestamp(a.date_saisie || a.date || a.created_at);
      const tb = parseActivityTimestamp(b.date_saisie || b.date || b.created_at);
      return tb - ta;
    });
    return computeProgressMetrics(sorted[0]);
  }, [progressEntries]);

  const homeProgress = useMemo(() => {
    if (myMemberPrograms.length > 0) {
      const completedHizb = myMemberPrograms.reduce(
        (sum, program) =>
          sum +
          ((Number(program.nbHizb) || 0) * (Number(program.progression) || 0)) / 100,
        0
      );
      return {
        memorizationPct: Math.min(
          100,
          Math.round((completedHizb / TOTAL_HIZB) * 100)
        ),
        memorizedJuz: Math.min(TOTAL_JUZ, Math.round(completedHizb / 2)),
      };
    }

    if (memorizationMetrics) {
      return {
        memorizationPct: memorizationMetrics.globalPct ?? 0,
        memorizedJuz: memorizationMetrics.juzeCourant ?? 0,
      };
    }

    return { memorizationPct: 0, memorizedJuz: 0 };
  }, [myMemberPrograms, memorizationMetrics]);

  const { memorizationPct, memorizedJuz } = homeProgress;

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
          entry.date_saisie || entry.date || entry.created_at
        ),
        title: "تحديث التقدم",
        body,
        icon: "book-outline",
        color: colors.primary,
        action: "program",
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
    logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
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

  const openProgramme = (program) =>
    navigation.navigate("ProgrammeDetails", {
      programme: {
        id: program.id,
        nom: program.title,
        nbHizb: program.nbHizb,
        duree: program.durationDays,
        progression: program.progression,
        dateDebut: program.startDate,
        statut: program.progression >= 100 ? "terminé" : "en cours",
      },
    });

  const openChat = () => navigation.navigate("MemberChatInbox");

  const handleActivityPress = (activity) => {
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
              <Text style={styles.headerSubtitle}>
                {tab === "home"
                  ? currentUser?.firstName || fullName
                  : fullName}
              </Text>
            </View>
            {tab === "programs" ? (
              <Ionicons name="book" size={22} color="white" />
            ) : tab === "registration" ? (
              <Ionicons name="clipboard-outline" size={22} color="white" />
            ) : null}
            <TouchableOpacity style={styles.headerBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="white" />
            </TouchableOpacity>
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
            <View style={styles.heroCard}>
              <ProgressRing
                progress={memorizationPct}
                size={148}
                stroke={12}
                color={colors.primary}
              >
                <View style={styles.ringInner}>
                  <Text style={styles.ringPct}>{memorizationPct}%</Text>
                  <Text style={styles.ringSubLabel}>نسبة الحفظ الكلية</Text>
                </View>
              </ProgressRing>
              <Text style={styles.juzCount}>
                {memorizedJuz} من {TOTAL_JUZ} جزء
              </Text>
            </View>

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
              <View style={styles.goalBarRow}>
                <Text style={styles.goalBarPct}>{goalPct}%</Text>
                <View style={styles.goalTrack}>
                  <View style={[styles.goalFill, { width: `${goalPct}%` }]} />
                </View>
              </View>
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

            <SectionCard
              title="الإشعارات"
              subtitle="تنبيهات الإدارة تظهر هنا مباشرة"
            >
              {adminAlerts.length === 0 ? (
                <EmptyState text="لا توجد تنبيهات بعد" />
              ) : (
                adminAlerts.slice(0, 5).map((n) => (
                  <View key={n.id} style={styles.notifItem}>
                    <Text style={styles.notifTitle}>تنبيه من الإدارة</Text>
                    <Text style={styles.notifBody}>{n.message}</Text>
                  </View>
                ))
              )}
            </SectionCard>

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
          <>
            <SectionCard title="الملف الشخصي" subtitle="معلومات الحساب">
              <View style={styles.profileTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {currentUser?.firstName?.[0] || "ع"}
                    {currentUser?.lastName?.[0] || ""}
                  </Text>
                </View>
                <Text style={styles.profileName}>{fullName}</Text>
                <View style={styles.rolePill}>
                  <Text style={styles.rolePillText}>
                    {ROLE_LABELS[currentUser?.role] || "عضو"}
                  </Text>
                </View>
              </View>

              <InfoRow label="البريد" value={currentUser?.email || "—"} />
              <InfoRow
                label="تاريخ الميلاد"
                value={currentUser?.birthDate || "—"}
              />
              {myGroup ? <InfoRow label="مجموعتي" value={myGroup.name} /> : null}

              <QuickButton
                color={colors.primary}
                icon="lock-closed-outline"
                label="تغيير كلمة المرور"
                onPress={() => setPasswordModal(true)}
              />
              <QuickButton
                color={colors.red}
                icon="log-out-outline"
                label="تسجيل الخروج"
                onPress={handleLogout}
              />
            </SectionCard>

            {myExams.length > 0 ? (
              <SectionCard title="نتائج الاختبارات" subtitle="درجاتك المسجلة">
                {myExams.map((e) => (
                  <StatCard
                    key={e.id}
                    icon="school-outline"
                    iconColor={colors.gold}
                    borderColor={colors.borderGold}
                    label={`${e.level} • ${e.date}`}
                    value={e.score}
                    valueColor={colors.gold}
                  />
                ))}
              </SectionCard>
            ) : null}
          </>
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
        </TouchableOpacity>
      </View>

      <ChangePasswordModal
        visible={passwordModal}
        onClose={() => setPasswordModal(false)}
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

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
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
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 16,
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
    fontSize: 20,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    marginTop: 4,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  headerBtn: {
    marginStart: 10,
    padding: 8,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.15)",
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
    paddingHorizontal: 8,
  },
  ringPct: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.primary,
    ...rtlText,
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
  profileTop: { alignItems: "center", marginBottom: 12 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "white", fontWeight: "bold", fontSize: 20 },
  profileName: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 12,
    color: colors.text,
    ...rtlText,
  },
  rolePill: {
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
    marginBottom: 8,
  },
  rolePillText: { color: colors.primaryDark, fontWeight: "600", ...rtlText },
  infoRow: {
    width: "100%",
    flexDirection: row,
    justifyContent: "space-between",
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 8,
  },
  infoLabel: { color: colors.muted, ...rtlText },
  infoValue: { fontWeight: "600", color: colors.text, ...rtlText },

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
});