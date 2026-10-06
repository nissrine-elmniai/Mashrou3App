import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  Menu,
  Bell,
  Users,
  UserCheck,
  TrendingUp,
  ClipboardList,
  Target,
  CalendarDays,
  GitCompare,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { SEASON_TYPES } from "../../constants/roles";
import { rtlText, row } from "../../constants/rtl";
import InboxHeaderButton from "../../components/InboxHeaderButton";
import { listSeasonStatsByType } from "../../lib/seasonStatsApi";
import SeasonsCompareView from "../../components/admin/SeasonsCompareView";
import {
  DonutChart,
  BarChart,
  DistributionBarChart,
  LineChart,
  ProgressMeter,
  UnderlinedTitle,
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

const JUZ_BAND_LABELS = {
  "0-5": "0–5 أجزاء",
  "5-10": "5–10",
  "10-15": "10–15",
  "15-20": "15–20",
  "20-25": "20–25",
  "25-30": "25–30",
};

const PRESENCE_BANDS = [
  { key: "ge90", label: "90% فأكثر" },
  { key: "p75_90", label: "75–90%" },
  { key: "p50_75", label: "50–75%" },
  { key: "lt50", label: "أقل من 50%" },
  { key: "sansDonnees", label: "بدون بيانات" },
];

function dash(value) {
  return value == null || value === "" ? "—" : String(value);
}

function formatHizbOne(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(Math.round(n * 10) / 10).toFixed(1)} حزب`;
}

function seanceNamesForSupervisor(bySeance, supervisorId) {
  if (!supervisorId || !Array.isArray(bySeance)) return [];
  return bySeance
    .filter((seance) => (seance.supervisorId || seance.supervisor_id) === supervisorId)
    .map((seance) => seance.name)
    .filter(Boolean);
}
function positionHizbHint(pct) {
  if (pct == null || pct === "") return null;
  const n = Number(pct);
  if (!Number.isFinite(n)) return null;
  const hizb = ((n * 60) / 100).toFixed(1);
  return `(≈ ${hizb} حزب من 60)`;
}

function dashPct(value) {
  return value == null ? "—" : `${value}%`;
}

function oneDecimal(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * 10) / 10);
}

function wholeNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n));
}

function seasonYear(startDate) {
  const year = String(startDate || "").slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function seasonLabel(view) {
  const year = seasonYear(view?.startDate);
  const name = view?.name || "موسم";
  return year ? `${name} · ${year}` : name;
}

function chipOrder(views) {
  const active = (views || []).filter((view) => view.active);
  const closed = (views || [])
    .filter((view) => !view.active)
    .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
  return [...active, ...closed];
}

function defaultSeasonId(views) {
  return chipOrder(views)[0]?.saisonId || null;
}

function previousClosed(views, selected) {
  if (!selected?.startDate) return null;
  const older = (views || [])
    .filter(
      (view) =>
        !view.active &&
        !view.empty &&
        view.saisonId !== selected.saisonId &&
        String(view.startDate || "") < String(selected.startDate)
    )
    .sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")));
  return older[older.length - 1] || null;
}

function kpiOf(view) {
  if (!view || view.empty) {
    return { members: null, presence: null, gain: null, tests: null, objectifs: null, seances: null };
  }
  return {
    members: view.effectifs?.membres ?? null,
    presence: view.presence?.pct ?? null,
    gain: view.progression?.gainMoyenHizb ?? null,
    tests: view.tests?.moyenne ?? null,
    objectifs: view.objectifs?.taux ?? null,
    seances: view.seancesTotal ?? null,
  };
}

function Delta({ current, previous }) {
  if (current == null || previous == null) return null;
  const diff = Math.round((Number(current) - Number(previous)) * 100) / 100;
  if (diff === 0) {
    return (
      <View style={[styles.deltaPill, styles.deltaPillEq]}>
        <Text style={styles.deltaEq}>=</Text>
      </View>
    );
  }
  const up = diff > 0;
  return (
    <View style={[styles.deltaPill, up ? styles.deltaPillUp : styles.deltaPillDown]}>
      <Text style={up ? styles.deltaUp : styles.deltaDown}>
        {up ? "▲" : "▼"} {Math.abs(diff)}
      </Text>
    </View>
  );
}

function MetricCard({ icon: Icon, label, value, unit, delta, width }) {
  return (
    <View style={[styles.metricCard, { width }]}>
      <View style={styles.metricTop}>
        <View style={styles.metricIcon}>
          <Icon size={16} color={palette.primary} pointerEvents="none" />
        </View>
        {delta}
      </View>
      <View style={styles.metricValueRow}>
        <Text style={styles.metricValue}>{value == null ? "—" : value}</Text>
        {value != null && unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SectionCard({ title, children }) {
  return (
    <View style={styles.sectionCard}>
      <UnderlinedTitle style={styles.sectionTitle}>{title}</UnderlinedTitle>
      {children}
    </View>
  );
}

function Unavailable() {
  return <Text style={styles.unavailable}>غير متوفر لهذا الموسم</Text>;
}

function Fact({ label, value }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export default function AdminStatsScreen({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "stats");
  const { seasons } = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomGap = Math.max(insets.bottom, 16);
  const chartWidth = Math.max(260, width - 64);
  const cardWidth = Math.floor((width - 32 - 12) / 2);
  const fabClearance = 56 + 24 + bottomGap;
  const typeTouched = useRef(false);
  const requestId = useRef(0);

  const [type, setType] = useState(() => {
    const active = (seasons || []).find((season) => season.active);
    return active?.type === SEASON_TYPES.SUMMER
      ? SEASON_TYPES.SUMMER
      : SEASON_TYPES.REGULAR;
  });
  const [mode, setMode] = useState("stats");
  const [views, setViews] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeTouched.current) return;
    if (!(seasons || []).length) return;
    const active = seasons.find((season) => season.active);
    setType(
      active?.type === SEASON_TYPES.SUMMER
        ? SEASON_TYPES.SUMMER
        : SEASON_TYPES.REGULAR
    );
  }, [seasons]);

  const load = useCallback(async (seasonType) => {
    const token = ++requestId.current;
    setLoading(true);
    setError(null);
    const res = await listSeasonStatsByType(seasonType);
    if (token !== requestId.current) return;
    setLoading(false);
    if (!res.ok) {
      setViews([]);
      setError(res.error || "تعذر تحميل الإحصائيات");
      return;
    }
    const list = res.seasons || [];
    setViews(list);
    setSelectedId((prev) =>
      prev && list.some((view) => view.saisonId === prev) ? prev : defaultSeasonId(list)
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(type);
    }, [load, type])
  );

  const chips = useMemo(() => chipOrder(views), [views]);
  const selected = views.find((view) => view.saisonId === selectedId) || null;
  const previous = previousClosed(views, selected);
  const currentKpi = kpiOf(selected);
  const previousKpi = kpiOf(previous);

  const pickType = (next) => {
    setMode("stats");
    if (next === type) return;
    typeTouched.current = true;
    setType(next);
    setViews([]);
    setSelectedId(null);
    setError(null);
    setLoading(true);
  };

  const monthPoints = (series) =>
    (series || []).map((point) => ({
      key: point.key,
      label: point.label,
      value: point.value,
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
        <InboxHeaderButton
          navigation={navigation}
          color={palette.textSecondary}
          variant="lucide"
          size={22}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="التنبيهات"
        >
          <Bell size={22} color={palette.textSecondary} pointerEvents="none" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: fabClearance }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.segments}>
          <TouchableOpacity
            style={[styles.segment, mode === "stats" && type === SEASON_TYPES.REGULAR && styles.segmentOn]}
            onPress={() => pickType(SEASON_TYPES.REGULAR)}
          >
            <Text
              style={[
                styles.segmentText,
                mode === "stats" && type === SEASON_TYPES.REGULAR && styles.segmentTextOn,
              ]}
            >
              المواسم العادية
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, mode === "stats" && type === SEASON_TYPES.SUMMER && styles.segmentOn]}
            onPress={() => pickType(SEASON_TYPES.SUMMER)}
          >
            <Text
              style={[
                styles.segmentText,
                mode === "stats" && type === SEASON_TYPES.SUMMER && styles.segmentTextOn,
              ]}
            >
              المدارس الصيفية
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, mode === "compare" && styles.segmentOn]}
            onPress={() => setMode("compare")}
          >
            <View style={styles.segmentInner}>
              <GitCompare
                size={14}
                color={mode === "compare" ? palette.primary : palette.textSecondary}
                pointerEvents="none"
              />
              <Text style={[styles.segmentText, mode === "compare" && styles.segmentTextOn]}>
                مقارنة المواسم
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {mode === "compare" ? (
          <SeasonsCompareView initialType={type} />
        ) : (
          <>
        {!loading && !error && chips.length === 0 ? (
          <Text style={styles.emptyHint}>لا توجد مواسم من هذا النوع</Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {chips.map((view) => {
              const on = view.saisonId === selectedId;
              return (
                <TouchableOpacity
                  key={view.saisonId}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setSelectedId(view.saisonId)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                    {seasonLabel(view)}
                  </Text>
                  {view.active ? (
                    <Text style={[styles.badge, on && styles.badgeOn]}>جاري</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={palette.primary} />
            <Text style={styles.stateText}>جاري تحميل الإحصائيات…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load(type)}>
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : !selected ? null : selected.empty ? (
          <Text style={styles.emptyHint}>لا توجد إحصائيات محفوظة لهذا الموسم</Text>
        ) : (
          <>
            <View style={styles.metricsGrid}>
              <MetricCard
                icon={Users}
                label="الأعضاء"
                value={wholeNumber(currentKpi.members)}
                width={cardWidth}
                delta={<Delta current={currentKpi.members} previous={previousKpi.members} />}
              />
              <MetricCard
                icon={UserCheck}
                label="نسبة الحضور"
                value={wholeNumber(currentKpi.presence)}
                unit="%"
                width={cardWidth}
                delta={<Delta current={currentKpi.presence} previous={previousKpi.presence} />}
              />
              <MetricCard
                icon={TrendingUp}
                label="متوسط الحفظ هذا الموسم"
                value={oneDecimal(currentKpi.gain)}
                unit="حزب"
                width={cardWidth}
                delta={<Delta current={currentKpi.gain} previous={previousKpi.gain} />}
              />
              <MetricCard
                icon={ClipboardList}
                label="معدل الاختبارات"
                value={oneDecimal(currentKpi.tests)}
                unit="/20"
                width={cardWidth}
                delta={<Delta current={currentKpi.tests} previous={previousKpi.tests} />}
              />
              <MetricCard
                icon={Target}
                label="نسبة الأعضاء الذين حققوا أهدافهم"
                value={wholeNumber(currentKpi.objectifs)}
                unit="%"
                width={cardWidth}
                delta={<Delta current={currentKpi.objectifs} previous={previousKpi.objectifs} />}
              />
              <MetricCard
                icon={CalendarDays}
                label="الحصص"
                value={wholeNumber(currentKpi.seances)}
                width={cardWidth}
                delta={<Delta current={currentKpi.seances} previous={previousKpi.seances} />}
              />
            </View>

            <SectionCard title="الأعضاء">
              {selected.effectifs == null ? (
                <Unavailable />
              ) : (
                <>
                  <Fact label="المجموع" value={dash(selected.effectifs.membres)} />
                  <DonutChart
                    segments={[
                      { key: "male", label: "ذكور", value: selected.effectifs.male, color: palette.primary },
                      { key: "female", label: "إناث", value: selected.effectifs.female, color: palette.primarySoft },
                      { key: "other", label: "غير محدد", value: selected.effectifs.nonSpecifie, color: palette.gold },
                    ].filter((segment) => {
                      if (segment.value == null) return false;
                      if (segment.key === "other" && Number(segment.value) === 0) return false;
                      return true;
                    })}
                    centerLabel={dash(selected.effectifs.membres)}
                    centerSub="أعضاء"
                    size={148}
                  />
                  <Fact label="أعضاء جدد" value={dash(selected.effectifs.nouveaux)} />
                  <Fact label="تجديدات" value={dash(selected.effectifs.renouvellements)} />
                  <Fact label="طلبات مستلمة" value={dash(selected.effectifs.demandes?.recues)} />
                  <Fact label="طلبات مقبولة" value={dash(selected.effectifs.demandes?.acceptees)} />
                  <Fact label="طلبات مرفوضة" value={dash(selected.effectifs.demandes?.refusees)} />
                  <Fact label=" طلبات قيد الانتظار" value={dash(selected.effectifs.demandes?.enAttente)} />
                  <Fact label="نسبة القبول للطلبات" value={dashPct(selected.effectifs.tauxAcceptation)} />
                </>
              )}
            </SectionCard>

            <SectionCard title="الحضور">
              {selected.presence == null ? (
                <Unavailable />
              ) : (
                <>
                  <View style={styles.presenceStack}>
                    <View style={styles.presenceFacts}>
                      <Fact label="  نسبة الحضور" value={dashPct(selected.presence.pct)} />
                      <Fact label="عدد الأيام" value={dash(selected.presence.jours)} />
                      <Fact label=" الحضور " value={dash(selected.presence.present)} />
                      <Fact label=" الغياب  " value={dash(selected.presence.absent)} />
                    </View>
                    {selected.presence.parMois == null ? (
                      <Unavailable />
                    ) : (
                      <View style={styles.chartBlock}>
                        <UnderlinedTitle style={styles.chartTitle}>  تطور نسبة الحضور خلال الشهور </UnderlinedTitle>
                        <LineChart
                          points={monthPoints(selected.presence.parMois)}
                          width={chartWidth}
                          height={170}
                          pointSuffix="%"
                        />
                      </View>
                    )}
                    {selected.presence.repartition == null ? (
                      <Unavailable />
                    ) : (
                      <View style={styles.chartBlock}>
                        <UnderlinedTitle style={styles.chartTitle}>توزيع الأعضاء حسب نسبة الحضور </UnderlinedTitle>
                        <DistributionBarChart
                          items={PRESENCE_BANDS.map((band) => ({
                            key: band.key,
                            label: band.label,
                            value: selected.presence.repartition[band.key],
                          }))}
                          height={120}
                        />
                      </View>
                    )}
                  </View>
                </>
              )}
            </SectionCard>

            <SectionCard title="التقدم">
              {selected.rattrapage ? (
                <Text style={styles.rattrapageNote}>بيانات التقدم أعيد حسابها من سجل الحفظ</Text>
              ) : null}
              {selected.progression == null ? (
                <Unavailable />
              ) : (
                <View style={styles.presenceStack}>
                  <View style={styles.presenceFacts}>
                    <ProgressMeter
                      label={
                        selected.rattrapage
                          ? "الموقع في نهاية الموسم"
                          : "متوسط المحفوظ من القرآن"
                      }
                      value={selected.progression.avgPositionPct}
                      hint={positionHizbHint(selected.progression.avgPositionPct)}
                    />
                    <UnderlinedTitle style={styles.blockLabel}>مقدار الحفظ خلال الموسم</UnderlinedTitle>
                    <Fact
                      label="متوسط الحفظ  الجديد"
                      value={formatHizbOne(selected.progression.gainMoyenHizb)}
                    />
                    <Fact
                      label="  الأحزاب المكتمل حفظها في المجموع"
                      value={formatHizbOne(selected.progression.gainTotalHizb)}
                    />
                    <Fact label="عدد الختمات" value={dash(selected.progression.khatm)} />
                    <Fact
                      label="عدد الأعضاء المسجَّل تقدّمهم"
                      value={dash(selected.progression.membresAvecDonnees)}
                    />
                  </View>
                  {selected.progression.timeline == null ? (
                    <Unavailable />
                  ) : (
                    <View style={styles.chartBlock}>
                      <UnderlinedTitle style={styles.chartTitle}>تطور متوسط الحفظ حسب الشهر </UnderlinedTitle>
                      <LineChart
                        points={monthPoints(selected.progression.timeline)}
                        width={chartWidth}
                        height={170}
                        pointSuffix="%"
                      />
                    </View>
                  )}
                  {selected.progression.parTranche == null ? (
                    <Unavailable />
                  ) : (
                    <View style={styles.chartBlock}>
                      <UnderlinedTitle style={styles.chartTitle}>توزيع الأعضاء حسب المحفوظ (بالأجزاء)</UnderlinedTitle>
                      <DistributionBarChart
                        items={selected.progression.parTranche.map((band) => ({
                          key: band.key,
                          label: JUZ_BAND_LABELS[band.key] || band.key,
                          value: band.count,
                        }))}
                        height={120}
                      />
                    </View>
                  )}
                </View>
              )}
            </SectionCard>

            <SectionCard title="الاختبارات">
              {selected.tests == null ? (
                <Unavailable />
              ) : (
                <>
                  <Fact label="عدد الاختبارات" value={dash(selected.tests.count)} />
                  <Fact label="المدعوون" value={dash(selected.tests.invites)} />
                  <Fact label="المقيَّمون" value={dash(selected.tests.notes)} />
                  <Fact label="المعدل /20" value={dash(selected.tests.moyenne)} />
                  <Fact label="الأدنى /20" value={dash(selected.tests.min)} />
                  <Fact label="الأعلى /20" value={dash(selected.tests.max)} />
                  {selected.tests.distribution == null ? null : (
                    <View style={styles.chartBlock}>
                      <UnderlinedTitle style={styles.chartTitle}>توزيع النقاط </UnderlinedTitle>
                      <DistributionBarChart
                        items={selected.tests.distribution.map((band) => ({
                          key: band.key,
                          label: band.key,
                          value: band.count,
                        }))}
                        height={120}
                      />
                    </View>
                  )}
                  {(selected.tests.parTest || []).map((test) => (
                    <View key={test.id || test.titre} style={styles.testRow}>
                      <Text style={styles.testTitle}>{test.titre || "اختبار"}</Text>
                      <Text style={styles.testMeta}>
                        {test.date ? String(test.date).slice(0, 10) : "—"}
                        {" · "}مدعوون {dash(test.invites)}
                        {" · "}مقيَّمون {dash(test.notes)}
                        {" · "}المعدل {dash(test.moyenne)}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </SectionCard>

            <SectionCard title="الأهداف">
              {selected.objectifs == null ? (
                <Unavailable />
              ) : (
                <>
                  <Fact label="أهداف محددة" value={dash(selected.objectifs.fixes)} />
                  <Fact label="أهداف محققة" value={dash(selected.objectifs.atteints)} />
                  <Fact
                    label="نسبة الأعضاء الذين حققوا أهدافهم"
                    value={dashPct(selected.objectifs.taux)}
                  />
                  <Fact
                    label="متوسط إنجاز الأهداف"
                    value={dashPct(selected.objectifs.realisationMoyennePct)}
                  />
                </>
              )}
            </SectionCard>

            <SectionCard
              title={`الحصص: ${dash(selected.seancesTotal ?? selected.bySeance?.length)}`}
            >
              {selected.bySeance == null ? (
                <Unavailable />
              ) : (
                <>
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartTitle}>عدد الأعضاء في كل حصة</Text>
                    <BarChart
                      items={selected.bySeance.map((seance) => ({
                        key: seance.id,
                        label: seance.name,
                        value: seance.membersCount,
                      }))}
                      height={120}
                      valueSuffix=" عضو"
                      emptyLabel="لا حصص"
                    />
                  </View>
                  {selected.bySeance.map((seance) => (
                    <View key={seance.id} style={styles.testRow}>
                      <Text style={styles.testTitle}>{seance.name}</Text>
                      <Text style={styles.testMeta}>
                        الأعضاء {dash(seance.membersCount)}
                        {" · "}الحضور {dashPct(seance.presencePct)}
                        {" · "}مقدار الحفظ {formatHizbOne(seance.gainMoyenHizb)}
                        {" · "}عدد الأيام {dash(seance.sessionCount)}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </SectionCard>

            <SectionCard
              title={`المشرفون: ${dash(selected.supervisorsTotal ?? selected.bySupervisor?.length)}`}
            >
              {selected.bySupervisor == null ? (
                <Unavailable />
              ) : (
                selected.bySupervisor.map((sup) => {
                  const names = seanceNamesForSupervisor(selected.bySeance, sup.id);
                  const name = sup.name || "—";
                  return (
                    <View key={sup.id} style={styles.testRow}>
                      <Text style={styles.testTitle}>
                        {names.length === 1 ? `${name} : ${names[0]}` : name}
                      </Text>
                      {names.length === 1 ? null : (
                        <Text style={styles.testMeta}>
                          {names.length > 1 ? `الحصص: ${names.join("، ")}` : "—"}
                        </Text>
                      )}
                    </View>
                  );
                }))}
            </SectionCard>
          </>
        )}
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
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: row,
    alignItems: "center",
    gap: 8,
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
  content: { padding: 16, gap: 16 },
  segments: {
    flexDirection: row,
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentOn: { backgroundColor: "#FFD666" },
  segmentInner: { flexDirection: row, alignItems: "center", justifyContent: "center", gap: 4 },
  segmentText: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  segmentTextOn: { color: "#000000" },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    height: 36,
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { color: palette.textPrimary, fontSize: 14, ...rtlText },
  chipTextOn: { color: "#fff" },
  badge: {
    fontSize: 11,
    color: palette.primary,
    backgroundColor: palette.softGreen,
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeOn: { color: palette.primary, backgroundColor: "#fff" },
  rattrapageNote: { color: palette.textSecondary, fontSize: 12, ...rtlText },
  stateBox: { alignItems: "center", paddingVertical: 32, gap: 12 },
  stateText: { color: palette.textSecondary, ...rtlText },
  errorText: { color: palette.red, textAlign: "center", ...rtlText },
  retryBtn: {
    backgroundColor: palette.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "700", ...rtlText },
  emptyHint: { color: palette.textSecondary, textAlign: "center", paddingVertical: 24, ...rtlText },
  metricsGrid: { flexDirection: row, flexWrap: "wrap", gap: 12 },
  metricCard: {
    minHeight: 132,
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  metricTop: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: palette.softGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValueRow: { flexDirection: row, alignItems: "baseline", gap: 4 },
  metricValue: { fontSize: 24, fontWeight: "700", color: palette.textPrimary },
  metricUnit: { fontSize: 14, color: palette.textSecondary },
  metricLabel: { fontSize: 13, color: palette.textSecondary, ...rtlText },
  deltaPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  deltaPillUp: { backgroundColor: palette.softGreen },
  deltaPillDown: { backgroundColor: "#FFEBEE" },
  deltaPillEq: { backgroundColor: "#EEEEEE" },
  deltaUp: { color: palette.primary, fontWeight: "700", fontSize: 12 },
  deltaDown: { color: palette.red, fontWeight: "700", fontSize: 12 },
  deltaEq: { color: palette.textSecondary, fontWeight: "700", fontSize: 12 },
  sectionCard: {
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: palette.textPrimary, ...rtlText },
  presenceStack: { gap: 24 },
  presenceFacts: { gap: 10 },
  chartBlock: { gap: 8 },
  chartTitle: { fontSize: 14, fontWeight: "700", color: palette.textPrimary, ...rtlText },
  unavailable: { color: palette.textSecondary, ...rtlText },
  factRow: { flexDirection: row, justifyContent: "space-between", gap: 8 },
  factLabel: { color: palette.textSecondary, fontSize: 13, ...rtlText },
  factValue: { color: palette.textPrimary, fontWeight: "700", fontSize: 13, ...rtlText },
  blockLabel: { color: palette.textPrimary, fontWeight: "700", marginTop: 8, ...rtlText },
  testRow: { gap: 2, paddingVertical: 4 },
  testTitle: { color: palette.textPrimary, fontWeight: "700", ...rtlText },
  testMeta: { color: palette.textSecondary, fontSize: 12, ...rtlText },
});
