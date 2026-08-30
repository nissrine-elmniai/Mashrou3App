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
import { Home, BookOpen, User } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { getMyProgress, computeProgressMetrics } from "../../lib/progressApi";
import {
  REGISTRATION_STATUS_LABELS,
  SEASON_TYPES,
  SEASON_TYPE_LABELS,
  ROLE_LABELS,
} from "../../constants/roles";
import { FREE_TIME_OPTIONS } from "../../data/seed";
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

const alignEdge = I18nManager.isRTL ? "flex-start" : "flex-end";

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
    getMemberProgress,
    getNotificationsForUser,
  } = useApp();

  const [tab, setTab] = useState("home");
  const [adminAlerts, setAdminAlerts] = useState([]);
  const [progressEntries, setProgressEntries] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [selectedTimes, setSelectedTimes] = useState([]);
  const [summerTimes, setSummerTimes] = useState([]);
  const [passwordModal, setPasswordModal] = useState(false);

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

  const myGroup = getMemberGroup(currentUser?.id, activeRegular?.id);
  const mySummerGroup = getMemberGroup(currentUser?.id, activeSummer?.id);
  const myProgress = getMemberProgress(currentUser?.id, activeRegular?.id);
  const mySummerProgress = getMemberProgress(
    currentUser?.id,
    activeSummer?.id
  );
  const myExams = exams.filter((e) => e.memberId === currentUser?.id);

  const progressPct = useMemo(() => {
    if (!myProgress) return 0;
    return Math.min(
      100,
      Math.round(
        ((myProgress.hifzPages || 0) / (myProgress.targetPages || 1)) * 100
      )
    );
  }, [myProgress]);

  const summerPct = useMemo(() => {
    if (!mySummerProgress) return 0;
    return Math.min(
      100,
      Math.round(
        ((mySummerProgress.hifzPages || 0) /
          (mySummerProgress.targetPages || 1)) *
          100
      )
    );
  }, [mySummerProgress]);

  const activePrograms = [myProgress, mySummerProgress].filter(Boolean).length;
  const totalAhzab = Math.round(
    ((myProgress?.hifzPages || 0) + (mySummerProgress?.hifzPages || 0)) / 20
  );
  const overallDisplay =
    activePrograms === 0
      ? 0
      : Math.round(
          ((myProgress ? progressPct : 0) + (mySummerProgress ? summerPct : 0)) /
            activePrograms
        );

  const userNotifications = useMemo(
    () => getNotificationsForUser(currentUser),
    [currentUser, getNotificationsForUser]
  );

  const recentActivities = useMemo(() => {
    const items = [];
    if (!currentUser?.id) return items;

    progressEntries.forEach((entry, idx) => {
      const metrics = computeProgressMetrics(entry);
      const juze = entry.juze;
      const tumun = entry.tumun;
      let body = `الجزء ${juze}`;
      if (tumun != null && tumun !== "") {
        body += ` — الثمن ${tumun}`;
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
        action: "programs",
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
        action: "programs",
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

  const programs = useMemo(() => {
    const list = [];
    if (myProgress && myGroup) {
      const pages = myProgress.hifzPages || 0;
      list.push({
        id: myProgress.id,
        title: `برنامج ${myGroup.name}`,
        ahzab: Math.max(0, Math.round(pages / 20)),
        days: 30,
        start: activeRegular?.startDate || "—",
        done: progressPct >= 100,
        pct: progressPct,
      });
    }
    if (mySummerProgress && mySummerGroup) {
      const pages = mySummerProgress.hifzPages || 0;
      list.push({
        id: mySummerProgress.id,
        title: `برنامج ${mySummerGroup.name}`,
        ahzab: Math.max(0, Math.round(pages / 20)),
        days: 30,
        start: activeSummer?.startDate || "—",
        done: summerPct >= 100,
        pct: summerPct,
      });
    }
    return list;
  }, [
    myProgress,
    myGroup,
    mySummerProgress,
    mySummerGroup,
    progressPct,
    summerPct,
    activeRegular,
    activeSummer,
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

  const openProgramme = (p) =>
    navigation.navigate("ProgrammeDetails", {
      programme: {
        id: p.id,
        nom: p.title,
        nbHizb: p.ahzab,
        duree: p.days,
        progression: p.pct,
        dateDebut:
          p.start && p.start !== "—"
            ? p.start
            : new Date().toISOString().slice(0, 10).replace(/-/g, "/"),
        statut: p.done ? "terminé" : "en cours",
      },
    });

  const openChat = () => navigation.navigate("MemberChatInbox");

  const handleActivityPress = (activity) => {
    if (activity.action === "program" && programs[0]) {
      openProgramme(programs[0]);
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
                مرحباً، {currentUser?.firstName || ""}
              </Text>
              <Text style={styles.headerSubtitle}>
                متابعة برامجك وحفظك — {fullName}
              </Text>
            </View>
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
                progress={overallDisplay}
                size={132}
                stroke={12}
                color={colors.primary}
              />
              <Text style={styles.heroLabel}>التقدم الإجمالي</Text>
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

        {tab === "programs" && (
          <>
            <SectionCard title="برامجي" subtitle="البرامج الحالية والتقدم">
              {programs.length === 0 ? (
                <EmptyState text="لم تُوزَّع على مجموعة بعد" />
              ) : (
                programs.map((p) => (
                  <ProgramCard
                    key={p.id}
                    program={p}
                    onPress={() => openProgramme(p)}
                  />
                ))
              )}
            </SectionCard>

            <SectionCard
              title="التسجيل في الموسم"
              subtitle="اختر أوقات فراغك ثم أرسل الطلب"
            >
              {openRegular.length === 0 ? (
                <EmptyState text="تسجيل الموسم العادي مغلق" />
              ) : (
                <RegistrationBlock
                  options={FREE_TIME_OPTIONS}
                  selected={selectedTimes}
                  onToggle={(t) =>
                    setSelectedTimes((prev) =>
                      prev.includes(t)
                        ? prev.filter((x) => x !== t)
                        : [...prev, t]
                    )
                  }
                  seasons={openRegular}
                  buttonLabel="إرسال استمارة الموسم"
                  buttonColor={colors.primary}
                  onSubmit={(id) =>
                    handleRegister(id, selectedTimes, setSelectedTimes)
                  }
                />
              )}
            </SectionCard>

            <SectionCard
              title="المدرسة الصيفية"
              subtitle="تسجيل منفصل عن الموسم العادي"
              borderColor="#FFE0B2"
              primary={colors.orange}
            >
              {openSummer.length === 0 ? (
                <EmptyState text="تسجيل المدرسة الصيفية مغلق" />
              ) : (
                <RegistrationBlock
                  options={FREE_TIME_OPTIONS}
                  selected={summerTimes}
                  onToggle={(t) =>
                    setSummerTimes((prev) =>
                      prev.includes(t)
                        ? prev.filter((x) => x !== t)
                        : [...prev, t]
                    )
                  }
                  seasons={openSummer}
                  buttonLabel="إرسال استمارة الصيف"
                  buttonColor={colors.orange}
                  onSubmit={(id) =>
                    handleRegister(id, summerTimes, setSummerTimes)
                  }
                />
              )}
            </SectionCard>

            {myRegs.length > 0 ? (
              <SectionCard title="طلباتي" subtitle="حالة طلبات التسجيل">
                {myRegs.map((r) => {
                  const s = seasons.find((x) => x.id === r.seasonId);
                  return (
                    <View key={r.id} style={styles.reqCard}>
                      <Text style={styles.reqTitle}>{s?.name}</Text>
                      <Text style={styles.hint}>
                        {SEASON_TYPE_LABELS[s?.type]} •{" "}
                        {REGISTRATION_STATUS_LABELS[r.status]}
                      </Text>
                    </View>
                  );
                })}
              </SectionCard>
            ) : null}

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

        {tab === "profile" && (
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

function ProgramCard({ program, onPress }) {
  const content = (
    <>
      <View style={styles.programTop}>
        <View style={styles.programTitleWrap}>
          <Text style={styles.programName}>{program.title}</Text>
          <View
            style={[
              styles.programStatusBadge,
              program.done ? styles.statusDone : styles.statusProgress,
            ]}
          >
            <Text
              style={[
                styles.programStatusText,
                program.done
                  ? styles.statusDoneText
                  : styles.statusProgressText,
              ]}
            >
              {program.done ? "مكتمل" : "قيد التقدم"}
            </Text>
          </View>
        </View>
        <Ionicons name="book-outline" size={20} color={colors.primary} />
      </View>
      <Text style={styles.hint}>
        {program.ahzab} أحزاب • {program.days} يوم • البداية: {program.start}
      </Text>
      <View style={styles.progressHead}>
        <Text style={styles.pct}>{program.pct}%</Text>
        <Text style={styles.hint}>التقدم</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${program.pct}%` }]} />
      </View>
      {onPress ? (
        <View style={styles.programFooter}>
          <Text style={styles.programOpen}>عرض التفاصيل</Text>
          <Ionicons name={arrowForward} size={16} color={colors.primary} />
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.programCard}>{content}</View>;
  }
  return (
    <TouchableOpacity
      style={styles.programCard}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {content}
    </TouchableOpacity>
  );
}

function RegistrationBlock({
  options,
  selected,
  onToggle,
  seasons,
  buttonLabel,
  buttonColor,
  onSubmit,
}) {
  return (
    <View>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.timeChip, selected.includes(opt) && styles.timeActive]}
          onPress={() => onToggle(opt)}
        >
          <Text
            style={[
              styles.timeText,
              selected.includes(opt) && {
                color: colors.primary,
                fontWeight: "bold",
              },
            ]}
          >
            {opt}
          </Text>
        </TouchableOpacity>
      ))}
      {seasons.map((s) => (
        <QuickButton
          key={s.id}
          color={buttonColor}
          icon="send"
          label={`${buttonLabel} — ${s.name}`}
          onPress={() => onSubmit(s.id)}
        />
      ))}
    </View>
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

  timeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.bg,
  },
  timeActive: { backgroundColor: colors.soft, borderColor: colors.primary },
  timeText: { ...rtlText, color: colors.muted },
  reqCard: {
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.soft,
  },
  reqTitle: {
    ...rtlText,
    fontWeight: "bold",
    color: colors.primary,
  },
  hint: { ...rtlText, color: colors.muted, marginTop: 2 },
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