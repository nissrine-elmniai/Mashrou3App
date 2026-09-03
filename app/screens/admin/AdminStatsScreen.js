import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  Menu,
  Bell,
  Users,
  UserCog,
  Calendar,
  TrendingUp,
  UserCheck,
  Save,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import ActiveSeasonBanner from "../../components/ActiveSeasonBanner";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { SEASON_TYPES } from "../../constants/roles";
import { rtlText, row } from "../../constants/rtl";
import {
  getSeasonStats,
  computeSeasonStats,
  saveSeasonStatsSnapshot,
} from "../../lib/seasonStatsApi";
import {
  DonutChart,
  BarChart,
  LineChart,
  ProgressMeter,
} from "../../components/stats/StatsCharts";

const palette = {
  primary: "#2E7D32",
  primarySoft: "#81C784",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
  card: "#FFFFFF",
};

function MetricCard({ icon: Icon, label, value, highlight }) {
  return (
    <View style={[styles.metricCard, highlight && styles.metricCardHighlight]}>
      <View style={styles.metricIcon}>
        <Icon size={16} color={palette.primary} pointerEvents="none" />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function AdminStatsScreen({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "stats");
  const { seasons, currentUser, stats: appStats } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomGap = Math.max(insets.bottom, 16);
  const chartWidth = Math.max(260, width - 64);

  const regularSeasons = useMemo(
    () =>
      [...(seasons || [])]
        .filter((s) => s.type === SEASON_TYPES.REGULAR)
        .sort((a, b) => {
          if (a.active && !b.active) return -1;
          if (!a.active && b.active) return 1;
          return String(b.startDate || "").localeCompare(String(a.startDate || ""));
        }),
    [seasons]
  );

  const activeSeason = getActiveRegularSeason(seasons);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const selectedSeason =
    regularSeasons.find((s) => s.id === selectedSeasonId) ||
    activeSeason ||
    regularSeasons[0] ||
    null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [rawStats, setRawStats] = useState(null);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = appStats?.pendingRegs ?? 0;

  const loadStats = useCallback(async (season) => {
    if (!season?.id) {
      setRawStats(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getSeasonStats(season.id, {
      seasonActive: !!season.active,
      preferLive: !!season.active,
    });
    if (!res.ok) {
      setError(res.error || "تعذر تحميل الإحصائيات");
      setRawStats(res.stats || null);
    } else {
      setRawStats(res.stats);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!selectedSeasonId && activeSeason?.id) {
        setSelectedSeasonId(activeSeason.id);
      }
      const season =
        regularSeasons.find((s) => s.id === (selectedSeasonId || activeSeason?.id)) ||
        regularSeasons[0];
      loadStats(season);
    }, [selectedSeasonId, activeSeason?.id, regularSeasons, loadStats])
  );

  const handleSelectSeason = (seasonId) => {
    setSelectedSeasonId(seasonId);
  };

  const handleSaveSnapshot = async () => {
    if (!selectedSeason?.id || saving) return;
    setSaving(true);
    const live = await computeSeasonStats(selectedSeason.id);
    if (!live.ok) {
      setSaving(false);
      Alert.alert("تنبيه", live.error || "تعذر حساب الإحصائيات");
      return;
    }
    const save = await saveSeasonStatsSnapshot(live.stats);
    setSaving(false);
    if (!save.ok) {
      Alert.alert("تنبيه", save.error || "تعذر حفظ الملخص");
      return;
    }
    setRawStats(save.stats);
    Alert.alert(
      "تم الحفظ",
      "تم حفظ ملخص إحصائيات هذا الموسم. سيبقى متاحاً بعد إغلاق الموسم."
    );
  };

  const s = rawStats;
  const details = s?.details || { bySeance: [], bySupervisor: [], progressTimeline: [] };
  const unknownGender = Math.max(
    0,
    (s?.membersTotal || 0) - (s?.membersMale || 0) - (s?.membersFemale || 0)
  );

  const genderSegments = [
    {
      key: "male",
      label: "ذكور",
      value: s?.membersMale || 0,
      color: palette.primary,
    },
    {
      key: "female",
      label: "إناث",
      value: s?.membersFemale || 0,
      color: palette.primarySoft,
    },
    ...(unknownGender > 0
      ? [
          {
            key: "unknown",
            label: "غير محدد",
            value: unknownGender,
            color: "#BDBDBD",
          },
        ]
      : []),
  ];

  const seanceBarItems = (details.bySeance || [])
    .slice()
    .sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0))
    .slice(0, 8)
    .map((x) => ({
      key: x.id,
      label: x.name,
      value: x.membersCount || 0,
    }));

  const presenceBarItems = (details.bySeance || [])
    .slice()
    .sort((a, b) => (b.presencePct || 0) - (a.presencePct || 0))
    .slice(0, 8)
    .map((x) => ({
      key: x.id,
      label: x.name,
      value: x.presencePct || 0,
    }));

  const supervisorBarItems = (details.bySupervisor || []).map((x) => ({
    key: x.id,
    label: x.name,
    value: x.membersCount || 0,
  }));

  const timelinePoints = (details.progressTimeline || []).map((p) => ({
    key: p.key,
    label: p.label,
    value: p.avgPct || 0,
  }));

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
        <Text style={styles.topBarTitle}>الإحصائيات</Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
          {pendingCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {pendingCount > 9 ? "9+" : pendingCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + bottomGap }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ActiveSeasonBanner
          season={activeSeason}
          hint="الإحصائيات مرتبطة بالموسم المختار فقط"
        />

        <Text style={styles.blockTitle}>الموسم</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.seasonChips}
        >
          {regularSeasons.length === 0 ? (
            <Text style={styles.emptyHint}>لا توجد مواسم بعد</Text>
          ) : (
            regularSeasons.map((season) => {
              const active = selectedSeason?.id === season.id;
              return (
                <TouchableOpacity
                  key={season.id}
                  style={[styles.seasonChip, active && styles.seasonChipActive]}
                  onPress={() => handleSelectSeason(season.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.seasonChipText,
                      active && styles.seasonChipTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {season.name}
                  </Text>
                  {season.active ? (
                    <View
                      style={[styles.liveDot, active && styles.liveDotOnActive]}
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        {selectedSeason ? (
          <View style={styles.sourceBanner}>
            <Text style={styles.sourceBannerText}>
              {selectedSeason.active
                ? "موسم جاري — بيانات مباشرة"
                : rawStats?.source === "snapshot"
                  ? "موسم مغلق — ملخص محفوظ"
                  : "موسم مغلق — بيانات محسوبة من السجلات"}
            </Text>
            {rawStats?.snapshotAt ? (
              <Text style={styles.sourceBannerMeta}>
                آخر حفظ: {String(rawStats.snapshotAt).slice(0, 10)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {selectedSeason?.active ? (
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSaveSnapshot}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Save size={18} color="#fff" pointerEvents="none" />
                <Text style={styles.saveBtnText}>حفظ ملخص الموسم</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={palette.primary} />
            <Text style={styles.loadingText}>جاري تحميل الإحصائيات…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : !selectedSeason ? (
          <Text style={styles.emptyHint}>أنشئ موسماً جديداً أولاً</Text>
        ) : (
          <>
            <Text style={styles.blockTitle}>المؤشرات الرئيسية</Text>
            <View style={styles.metricsGrid}>
              <MetricCard
                icon={Users}
                label="الأعضاء"
                value={s?.membersTotal ?? 0}
                highlight
              />
              <MetricCard
                icon={Calendar}
                label="الحصص"
                value={s?.seancesTotal ?? 0}
              />
              <MetricCard
                icon={UserCog}
                label="المشرفون"
                value={s?.supervisorsTotal ?? 0}
              />
              <MetricCard
                icon={UserCheck}
                label="الحضور"
                value={`${s?.avgPresencePct ?? 0}%`}
              />
            </View>

            <SectionCard
              title="التقدم والحضور"
              subtitle="متوسط الموسم المحدد"
            >
              <ProgressMeter
                label="متوسط تقدم الأعضاء"
                value={s?.avgProgressPct ?? 0}
              />
              <View style={{ height: 14 }} />
              <ProgressMeter
                label="متوسط نسبة الحضور"
                value={s?.avgPresencePct ?? 0}
                color={palette.primary}
                trackColor={palette.softGreen}
              />
              <View style={styles.kpiHintRow}>
                <TrendingUp size={14} color={palette.primary} pointerEvents="none" />
                <Text style={styles.kpiHint}>
                  التقدم يُحسب من سجلات الجلسات ضمن هذا الموسم فقط
                </Text>
              </View>
            </SectionCard>

            <SectionCard
              title="توزيع الأعضاء"
              subtitle="حسب الجنس"
            >
              <DonutChart
                segments={genderSegments}
                centerLabel={s?.membersTotal ?? 0}
                centerSub="عضو"
                size={148}
              />
            </SectionCard>

            <SectionCard
              title="مقارنة الحصص"
              subtitle="عدد الأعضاء لكل حصة"
            >
              <BarChart items={seanceBarItems} height={120} />
            </SectionCard>

            <SectionCard
              title="الحضور حسب الحصة"
              subtitle="نسبة الحضور %"
            >
              <BarChart
                items={presenceBarItems}
                height={120}
                valueSuffix="%"
                barColor={palette.primary}
              />
            </SectionCard>

            <SectionCard
              title="المشرفون"
              subtitle="توزيع الأعضاء على المشرفين"
            >
              <BarChart
                items={supervisorBarItems}
                height={120}
                emptyLabel="لا مشرفين مرتبطين بهذا الموسم"
              />
            </SectionCard>

            <SectionCard
              title="تطور التقدم"
              subtitle="متوسط التقدم عبر أشهر الموسم"
            >
              <LineChart
                points={timelinePoints}
                width={chartWidth}
                height={170}
              />
            </SectionCard>
          </>
        )}
      </ScrollView>
      {messagesFab}
      {sidebar}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  topBar: {
    backgroundColor: palette.card,
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
    end: -6,
    backgroundColor: palette.red,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  blockTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 10,
    marginTop: 4,
    ...rtlText,
  },
  seasonChips: { gap: 8, paddingBottom: 10 },
  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    maxWidth: 220,
  },
  seasonChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  seasonChipText: {
    fontSize: 13,
    color: palette.textSecondary,
    fontWeight: "600",
    ...rtlText,
  },
  seasonChipTextActive: { color: "#fff" },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.gold,
  },
  liveDotOnActive: { backgroundColor: "#fff" },
  sourceBanner: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
    marginBottom: 12,
  },
  sourceBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: palette.textPrimary,
    ...rtlText,
  },
  sourceBannerMeta: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 4,
    ...rtlText,
  },
  saveBtn: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 14,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    ...rtlText,
  },
  metricsGrid: {
    flexDirection: row,
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metricCard: {
    width: "48%",
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricCardHighlight: {
    borderColor: "#C8E6C9",
    backgroundColor: "#FAFFFB",
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.softGreen,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "800",
    color: palette.primary,
    ...rtlText,
  },
  metricLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 2,
    ...rtlText,
  },
  sectionCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionHeader: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    ...rtlText,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 4,
    ...rtlText,
  },
  kpiHintRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  kpiHint: {
    flex: 1,
    fontSize: 11,
    color: palette.textSecondary,
    ...rtlText,
  },
  loadingCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    paddingVertical: 40,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  loadingText: {
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  emptyHint: {
    textAlign: "center",
    color: palette.textSecondary,
    marginTop: 24,
    ...rtlText,
  },
  errorText: {
    color: palette.red,
    textAlign: "center",
    marginTop: 16,
    ...rtlText,
  },
});
