import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import {
  REGISTRATION_STATUS_LABELS,
  SEASON_TYPES,
  SEASON_TYPE_LABELS,
  ROLE_LABELS,
} from "../../constants/roles";
import { FREE_TIME_OPTIONS } from "../../data/seed";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";
import {
  AppShell,
  StatCard,
  SectionCard,
  QuickButton,
  EmptyState,
} from "../../components/ui";

const TABS = [
  { key: "home", label: "الرئيسية" },
  { key: "programs", label: "برامجي" },
  { key: "profile", label: "ملفي" },
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
    markNotificationRead,
  } = useApp();

  const myNotifications = getNotificationsForUser(currentUser);

  const [tab, setTab] = useState("home");
  const [selectedTimes, setSelectedTimes] = useState([]);
  const [summerTimes, setSummerTimes] = useState([]);

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

  return (
    <AppShell
      title="لوحة تحكم العضو"
      subtitle={fullName || "متابعة البرامج والتقدم"}
      icon="book"
      onLogout={handleLogout}
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === "home" && (
        <>
          <StatCard
            icon="folder-outline"
            iconColor={colors.primary}
            borderColor={colors.borderGreen}
            label="البرامج النشطة"
            value={activePrograms}
            valueColor={colors.primary}
          />
          <StatCard
            icon="book-outline"
            iconColor={colors.gold}
            borderColor={colors.borderGold}
            label="مجموع الأحزاب"
            value={totalAhzab}
            valueColor={colors.gold}
          />
          <StatCard
            icon="trending-up-outline"
            iconColor={colors.green}
            borderColor={colors.borderGreen}
            label="التقدم الإجمالي"
            value={`${overallDisplay}%`}
            valueColor={colors.green}
          />

          {myNotifications.length > 0 ? (
            <SectionCard
              title="الإشعارات"
              subtitle="آخر التنبيهات والقرارات"
            >
              {myNotifications.slice(0, 5).map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={styles.notifItem}
                  onPress={() => markNotificationRead(n.id)}
                >
                  <Text style={styles.notifTitle}>{n.title}</Text>
                  <Text style={styles.notifBody}>{n.body}</Text>
                </TouchableOpacity>
              ))}
            </SectionCard>
          ) : null}

          <SectionCard
            title="الإجراءات السريعة"
            subtitle="الوصول السريع إلى الوظائف الرئيسية"
          >
            <QuickButton
              color={colors.orange}
              icon="school-outline"
              label="برامجي والتسجيل"
              onPress={() => setTab("programs")}
            />
            <QuickButton
              color={colors.primary}
              icon="person-outline"
              label="ملفي الشخصي"
              onPress={() => setTab("profile")}
            />
          </SectionCard>

          <SectionCard
            title="برامجي الأخيرة"
            subtitle="نظرة سريعة على تقدمك الفعلي"
          >
            {programs.length === 0 ? (
              <EmptyState text="لا يوجد برنامج بعد — سجّل في موسم مفتوح أولاً" />
            ) : (
              programs.slice(0, 2).map((p) => (
                <ProgramCard key={p.id} program={p} />
              ))
            )}
            <QuickButton
              color={colors.primary}
              icon="list-outline"
              label="عرض البرامج والتسجيل"
              onPress={() => setTab("programs")}
            />
          </SectionCard>
        </>
      )}

      {tab === "programs" && (
        <>
          <SectionCard title="برامجي" subtitle="البرامج الحالية والتقدم">
            {programs.length === 0 ? (
              <EmptyState text="لم تُوزَّع على مجموعة بعد" />
            ) : (
              programs.map((p) => <ProgramCard key={p.id} program={p} />)
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
          <InfoRow label="الجنس" value={currentUser?.gender || "—"} />
          {myGroup ? <InfoRow label="مجموعتي" value={myGroup.name} /> : null}

          <QuickButton
            color={colors.red}
            icon="log-out-outline"
            label="تسجيل الخروج"
            onPress={handleLogout}
          />
        </SectionCard>
      )}
    </AppShell>
  );
}

function ProgramCard({ program }) {
  return (
    <View style={styles.programCard}>
      <View style={styles.programTop}>
        <Text style={styles.programName}>{program.title}</Text>
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
    </View>
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
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  programCard: {
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
    backgroundColor: colors.soft,
  },
  programTop: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  programName: {
    color: colors.primary,
    fontWeight: "bold",
    fontSize: 15,
    ...rtlText,
    flex: 1,
  },
  progressHead: {
    flexDirection: "row-reverse",
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
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 8,
  },
  infoLabel: { color: colors.muted, ...rtlText },
  infoValue: { fontWeight: "600", color: colors.text, ...rtlText },
});
