import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  UserCheck,
  TrendingUp,
  ClipboardList,
  Target,
  CalendarDays,
  GitCompare,
  Share2,
} from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { ROLES, SEASON_TYPES, userHasRole } from "../../constants/roles";
import { rtlText, row } from "../../constants/rtl";
import InboxHeaderButton from "../../components/InboxHeaderButton";
import { getSeasonMemberRows, listSeasonStatsByType } from "../../lib/seasonStatsApi";
import { STATS_LABELS } from "../../lib/statsLabels";
import { alertForExportResult, exportSeasonPdf } from "../../lib/statsExport";
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
  "0-5": STATS_LABELS.juz0_5,
  "5-10": STATS_LABELS.juz5_10,
  "10-15": STATS_LABELS.juz10_15,
  "15-20": STATS_LABELS.juz15_20,
  "20-25": STATS_LABELS.juz20_25,
  "25-30": STATS_LABELS.juz25_30,
};

const PRESENCE_BANDS = [
  { key: "ge90", label: STATS_LABELS.band90 },
  { key: "p75_90", label: STATS_LABELS.band75 },
  { key: "p50_75", label: STATS_LABELS.band50 },
  { key: "lt50", label: STATS_LABELS.bandUnder50 },
  { key: "sansDonnees", label: STATS_LABELS.bandNoData },
];

function dash(value) {
  return value == null || value === "" ? "—" : String(value);
}

function formatHizbOne(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(Math.round(n * 10) / 10).toFixed(1)} ${STATS_LABELS.unitHizb}`;
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
  return STATS_LABELS.positionHint.replace("{value}", hizb);
}

function dashPct(value) {
  return value == null ? "—" : `${value}${STATS_LABELS.unitPercent}`;
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
  const name = view?.name || STATS_LABELS.seasonFallback;
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
  return <Text style={styles.unavailable}>{STATS_LABELS.unavailable}</Text>;
}

function Fact({ label, value }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const MEMBER_NAME_W = 140;
const MEMBER_COLS = [
  { key: "seance", label: STATS_LABELS.seance, width: 120 },
  { key: "presence", label: STATS_LABELS.comparePresence, width: 88 },
  { key: "position", label: STATS_LABELS.colPosition, width: 176 },
  { key: "gain", label: STATS_LABELS.colGain, width: 120 },
  { key: "tests", label: STATS_LABELS.tests, width: 84 },
  { key: "goal", label: STATS_LABELS.goal, width: 88 },
];

function hizbFromTumun(tumun) {
  if (tumun == null || tumun === "") return "—";
  const n = Number(tumun) / 8;
  if (!Number.isFinite(n)) return "—";
  const text = `${(Math.round(n * 10) / 10).toFixed(1)} ${STATS_LABELS.unitHizb}`;
  return n < 0 ? `\u200E${text}` : text;
}

function memberScore(row) {
  if (row?.source === "rattrapage") return "—";
  const notes = Number(row?.testsNotes);
  const average = oneDecimal(row?.noteMoyenne);
  if (!Number.isFinite(notes) || notes <= 0 || average == null) return "—";
  return `\u2066${average}${STATS_LABELS.unitScore}\u2069`;
}

function MemberPosition({ row }) {
  const start = hizbFromTumun(row?.posDebut);
  const end = hizbFromTumun(row?.posFin);
  if (start === "—" && end === "—") return <Text style={styles.memberCellText}>—</Text>;
  return (
    <View style={styles.memberPosition}>
      <Text style={styles.memberLtr}>{start}</Text>
      <Text style={styles.memberCellText}> ← </Text>
      <Text style={styles.memberLtr}>{end}</Text>
    </View>
  );
}

function MemberSeasonTable({ rows, onPress }) {
  if (!rows.length) return <Text style={styles.emptyHint}>{STATS_LABELS.noMemberData}</Text>;
  return (
    <View style={styles.memberTable}>
      <View style={styles.memberNameCol}>
        <View style={styles.memberHeadName}>
          <Text style={styles.memberHeadText} numberOfLines={1}>{STATS_LABELS.colName}</Text>
        </View>
        {rows.map((row, index) => (
          <TouchableOpacity
            key={`${row.membreId || index}-${row.source || ""}`}
            style={styles.memberNameCell}
            onPress={() => onPress(row)}
          >
            <Text style={styles.memberNameText} numberOfLines={1} ellipsizeMode="tail">
              {row.name || "—"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={styles.memberHeadRow}>
            {MEMBER_COLS.map((col) => (
              <View key={col.key} style={[styles.memberHeadCell, { width: col.width }]}>
                <Text style={styles.memberHeadText} numberOfLines={1}>{col.label}</Text>
              </View>
            ))}
          </View>
          {rows.map((row, index) => {
            const gain = Number(row.gainTumun);
            const negative = Number.isFinite(gain) && gain < 0;
            const rattrapage = row.source === "rattrapage";
            const goal =
              rattrapage || row.objectifAtteint == null
                ? "—"
                : row.objectifAtteint
                  ? STATS_LABELS.achieved
                  : STATS_LABELS.notAchieved;
            return (
              <TouchableOpacity
                key={`${row.membreId || index}-${row.source || ""}`}
                style={styles.memberDataRow}
                onPress={() => onPress(row)}
              >
                <View style={[styles.memberCell, { width: 120 }]}>
                  <Text style={styles.memberCellText} numberOfLines={1}>
                    {rattrapage ? "—" : row.seanceNom || "—"}
                  </Text>
                </View>
                <View style={[styles.memberCell, { width: 88 }]}>
                  <Text style={styles.memberCellText}>{rattrapage ? "—" : dashPct(row.presencePct)}</Text>
                </View>
                <View style={[styles.memberCell, { width: 176 }]}>
                  <MemberPosition row={row} />
                </View>
                <View style={[styles.memberCell, { width: 120 }]}>
                  <Text style={[styles.memberCellText, negative && styles.memberNegative]}>
                    {row.gainTumun == null
                      ? "—"
                      : `${negative ? "\u200E" : ""}${formatHizbOne(gain / 8)}`}
                  </Text>
                </View>
                <View style={[styles.memberCell, { width: 84 }]}>
                  <Text style={styles.memberLtr}>{memberScore(row)}</Text>
                </View>
                <View style={[styles.memberCell, { width: 88 }]}>
                  <Text
                    style={[
                      styles.memberCellText,
                      row.objectifAtteint === true && !rattrapage && styles.memberAchieved,
                      row.objectifAtteint === false && !rattrapage && styles.memberMissed,
                    ]}
                  >
                    {goal}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export default function AdminStatsScreen({ navigation }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "stats");
  const { seasons, currentUser } = useApp();
  const isAdmin = userHasRole(currentUser, ROLES.ADMIN);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomGap = Math.max(insets.bottom, 16);
  const chartWidth = Math.max(260, width - 64);
  const cardWidth = Math.floor((width - 32 - 12) / 2);
  const fabClearance = 56 + 24 + bottomGap;
  const typeTouched = useRef(false);
  const requestId = useRef(0);
  const selectedIdRef = useRef(null);

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
  const [memberRows, setMemberRows] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [compareExport, setCompareExport] = useState({
    disabled: true,
    busy: false,
    run: null,
  });
  const onCompareExportState = useCallback((state) => {
    setCompareExport(state);
  }, []);

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
    if (!res.ok) {
      setViews([]);
      setMemberRows([]);
      setError(res.error || STATS_LABELS.loadError);
      setLoading(false);
      return;
    }
    const list = res.seasons || [];
    const nextId =
      selectedIdRef.current && list.some((view) => view.saisonId === selectedIdRef.current)
        ? selectedIdRef.current
        : defaultSeasonId(list);
    const season = list.find((view) => view.saisonId === nextId) || null;
    let rows = [];
    if (isAdmin && season && !season.empty) {
      const members = await getSeasonMemberRows({
        id: season.saisonId,
        active: !!season.active,
      });
      if (token !== requestId.current) return;
      if (!members.ok) {
        setViews([]);
        setMemberRows([]);
        setError(members.error || STATS_LABELS.loadError);
        setLoading(false);
        return;
      }
      rows = members.rows || [];
    }
    setMemberRows(rows);
    setViews(list);
    selectedIdRef.current = nextId;
    setSelectedId(nextId);
    setLoading(false);
  }, [isAdmin]);

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
    setMemberRows([]);
    selectedIdRef.current = null;
    setSelectedId(null);
    setError(null);
    setLoading(true);
  };

  const selectSeason = async (view) => {
    if (!view || view.saisonId === selectedId) return;
    const token = ++requestId.current;
    selectedIdRef.current = view.saisonId;
    setSelectedId(view.saisonId);
    if (!isAdmin || view.empty) {
      setMemberRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    const members = await getSeasonMemberRows({
      id: view.saisonId,
      active: !!view.active,
    });
    if (token !== requestId.current) return;
    if (!members.ok) {
      setMemberRows([]);
      setError(members.error || STATS_LABELS.loadError);
      setLoading(false);
      return;
    }
    setMemberRows(members.rows || []);
    setLoading(false);
  };

  const openMember = (row) => {
    const parts = String(row?.name || "").trim().split(/\s+/).filter(Boolean);
    navigation.navigate("MemberProfile", {
      memberId: row.membreId,
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" "),
      adminTheme: true,
      viewerRole: "admin",
    });
  };

  const exportDisabled = exporting || loading || !selected || selected.empty;
  const fabBusy = mode === "compare" ? compareExport.busy : exporting;
  const fabDisabled =
    mode === "compare"
      ? compareExport.disabled || compareExport.busy || !compareExport.run
      : exportDisabled;

  const exportSelected = async () => {
    if (exportDisabled || !selected) return;
    setExporting(true);
    try {
      const seasonRow = (seasons || []).find((item) => item.id === selected.saisonId) || {};
      const members = await getSeasonMemberRows({
        id: selected.saisonId,
        active: !!selected.active,
      });
      if (!members.ok) {
        Alert.alert(STATS_LABELS.exportFailed);
        return;
      }
      const result = await exportSeasonPdf(
        {
          id: selected.saisonId,
          name: selected.name || seasonRow.name,
          type: selected.type || seasonRow.type,
          active: !!selected.active,
          startDate: selected.startDate || seasonRow.startDate || null,
          endDate: seasonRow.endDate || null,
        },
        { ...selected, previousKpi },
        members.rows
      );
      alertForExportResult(result);
    } catch {
      Alert.alert(STATS_LABELS.exportFailed);
    } finally {
      setExporting(false);
    }
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
        <Text style={styles.topBarTitle}>{STATS_LABELS.screenTitle}</Text>
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
              {STATS_LABELS.seasonsRegular}
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
              {STATS_LABELS.seasonsSummer}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, mode === "compare" && styles.segmentOn]}
            onPress={() => setMode("compare")}
          >
            <View style={styles.segmentInner}>
              <GitCompare
                size={14}
                color={mode === "compare" ? "#000000" : palette.textSecondary}
                pointerEvents="none"
              />
              <Text style={[styles.segmentText, mode === "compare" && styles.segmentTextOn]}>
                {STATS_LABELS.compareTitle}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {mode === "compare" ? (
          <SeasonsCompareView initialType={type} onExportState={onCompareExportState} />
        ) : (
          <>
        {!loading && !error && chips.length === 0 ? (
          <Text style={styles.emptyHint}>{STATS_LABELS.noSeasonsOfType}</Text>
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
                  onPress={() => selectSeason(view)}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                    {seasonLabel(view)}
                  </Text>
                  {view.active ? (
                    <Text style={[styles.badge, on && styles.badgeOn]}>{STATS_LABELS.active}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {loading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color={palette.primary} />
            <Text style={styles.stateText}>{STATS_LABELS.loading}</Text>
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => load(type)}>
              <Text style={styles.retryText}>{STATS_LABELS.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : !selected ? null : selected.empty ? (
          <Text style={styles.emptyHint}>{STATS_LABELS.noSavedStats}</Text>
        ) : (
          <>
            <View style={styles.metricsGrid}>
              <MetricCard
                icon={Users}
                label={STATS_LABELS.members}
                value={wholeNumber(currentKpi.members)}
                width={cardWidth}
                delta={<Delta current={currentKpi.members} previous={previousKpi.members} />}
              />
              <MetricCard
                icon={UserCheck}
                label={STATS_LABELS.presenceRate}
                value={wholeNumber(currentKpi.presence)}
                unit={STATS_LABELS.unitPercent}
                width={cardWidth}
                delta={<Delta current={currentKpi.presence} previous={previousKpi.presence} />}
              />
              <MetricCard
                icon={TrendingUp}
                label={STATS_LABELS.gainSeasonAvg}
                value={oneDecimal(currentKpi.gain)}
                unit={STATS_LABELS.unitHizb}
                width={cardWidth}
                delta={<Delta current={currentKpi.gain} previous={previousKpi.gain} />}
              />
              <MetricCard
                icon={ClipboardList}
                label={STATS_LABELS.testsAverage}
                value={
                  currentKpi.tests == null
                    ? null
                    : `\u2066${oneDecimal(currentKpi.tests)}${STATS_LABELS.unitScore}\u2069`
                }
                width={cardWidth}
                delta={<Delta current={currentKpi.tests} previous={previousKpi.tests} />}
              />
              <MetricCard
                icon={Target}
                label={STATS_LABELS.objectifsRate}
                value={wholeNumber(currentKpi.objectifs)}
                unit={STATS_LABELS.unitPercent}
                width={cardWidth}
                delta={<Delta current={currentKpi.objectifs} previous={previousKpi.objectifs} />}
              />
              <MetricCard
                icon={CalendarDays}
                label={STATS_LABELS.seances}
                value={wholeNumber(currentKpi.seances)}
                width={cardWidth}
                delta={<Delta current={currentKpi.seances} previous={previousKpi.seances} />}
              />
            </View>

            <SectionCard title={STATS_LABELS.members}>
              {selected.effectifs == null ? (
                <Unavailable />
              ) : (
                <>
                  <Fact label={STATS_LABELS.total} value={dash(selected.effectifs.membres)} />
                  <DonutChart
                    segments={[
                      { key: "male", label: STATS_LABELS.male, value: selected.effectifs.male, color: palette.primary },
                      { key: "female", label: STATS_LABELS.female, value: selected.effectifs.female, color: palette.primarySoft },
                      { key: "other", label: STATS_LABELS.unspecified, value: selected.effectifs.nonSpecifie, color: palette.gold },
                    ].filter((segment) => {
                      if (segment.value == null) return false;
                      if (segment.key === "other" && Number(segment.value) === 0) return false;
                      return true;
                    })}
                    centerLabel={dash(selected.effectifs.membres)}
                    centerSub={STATS_LABELS.membersWord}
                    size={148}
                  />
                  <Fact label={STATS_LABELS.newMembers} value={dash(selected.effectifs.nouveaux)} />
                  <Fact label={STATS_LABELS.renewals} value={dash(selected.effectifs.renouvellements)} />
                  <Fact label={STATS_LABELS.requestsReceived} value={dash(selected.effectifs.demandes?.recues)} />
                  <Fact label={STATS_LABELS.requestsAccepted} value={dash(selected.effectifs.demandes?.acceptees)} />
                  <Fact label={STATS_LABELS.requestsRejected} value={dash(selected.effectifs.demandes?.refusees)} />
                  <Fact label={STATS_LABELS.requestsPending} value={dash(selected.effectifs.demandes?.enAttente)} />
                  <Fact label={STATS_LABELS.acceptanceRate} value={dashPct(selected.effectifs.tauxAcceptation)} />
                </>
              )}
              {isAdmin ? (
                <>
                  <Text style={styles.memberListTitle}>{STATS_LABELS.memberList}</Text>
                  <MemberSeasonTable rows={memberRows} onPress={openMember} />
                </>
              ) : null}
            </SectionCard>

            <SectionCard title={STATS_LABELS.presence}>
              {selected.presence == null ? (
                <Unavailable />
              ) : (
                <>
                  <View style={styles.presenceStack}>
                    <View style={styles.presenceFacts}>
                      <Fact label={STATS_LABELS.presenceRateFact} value={dashPct(selected.presence.pct)} />
                      <Fact label={STATS_LABELS.daysCount} value={dash(selected.presence.jours)} />
                      <Fact label={STATS_LABELS.present} value={dash(selected.presence.present)} />
                      <Fact label={STATS_LABELS.absent} value={dash(selected.presence.absent)} />
                    </View>
                    {selected.presence.parMois == null ? (
                      <Unavailable />
                    ) : (
                      <View style={styles.chartBlock}>
                        <UnderlinedTitle style={styles.chartTitle}>{STATS_LABELS.presenceCurve}</UnderlinedTitle>
                        <LineChart
                          points={monthPoints(selected.presence.parMois)}
                          width={chartWidth}
                          height={170}
                          pointSuffix={STATS_LABELS.unitPercent}
                        />
                      </View>
                    )}
                    {selected.presence.repartition == null ? (
                      <Unavailable />
                    ) : (
                      <View style={styles.chartBlock}>
                        <UnderlinedTitle style={styles.chartTitle}>{STATS_LABELS.presenceDistribution}</UnderlinedTitle>
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

            <SectionCard title={STATS_LABELS.progress}>
              {selected.rattrapage ? (
                <Text style={styles.rattrapageNote}>{STATS_LABELS.rattrapageNote}</Text>
              ) : null}
              {selected.progression == null ? (
                <Unavailable />
              ) : (
                <View style={styles.presenceStack}>
                  <View style={styles.presenceFacts}>
                    <ProgressMeter
                      label={
                        selected.rattrapage
                          ? STATS_LABELS.positionEnd
                          : STATS_LABELS.avgQuran
                      }
                      value={selected.progression.avgPositionPct}
                      hint={positionHizbHint(selected.progression.avgPositionPct)}
                    />
                    <UnderlinedTitle style={styles.blockLabel}>{STATS_LABELS.gainDuringSeason}</UnderlinedTitle>
                    <Fact
                      label={STATS_LABELS.gainNew}
                      value={formatHizbOne(selected.progression.gainMoyenHizb)}
                    />
                    <Fact
                      label={STATS_LABELS.gainTotal}
                      value={formatHizbOne(selected.progression.gainTotalHizb)}
                    />
                    <Fact label={STATS_LABELS.khatmCount} value={dash(selected.progression.khatm)} />
                    <Fact
                      label={STATS_LABELS.membersWithProgress}
                      value={dash(selected.progression.membresAvecDonnees)}
                    />
                  </View>
                  {selected.progression.timeline == null ? (
                    <Unavailable />
                  ) : (
                    <View style={styles.chartBlock}>
                      <UnderlinedTitle style={styles.chartTitle}>{STATS_LABELS.progressCurve}</UnderlinedTitle>
                      <LineChart
                        points={monthPoints(selected.progression.timeline)}
                        width={chartWidth}
                        height={170}
                        pointSuffix={STATS_LABELS.unitPercent}
                      />
                    </View>
                  )}
                  {selected.progression.parTranche == null ? (
                    <Unavailable />
                  ) : (
                    <View style={styles.chartBlock}>
                      <UnderlinedTitle style={styles.chartTitle}>{STATS_LABELS.juzDistribution}</UnderlinedTitle>
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

            <SectionCard title={STATS_LABELS.tests}>
              {selected.tests == null ? (
                <Unavailable />
              ) : (
                <>
                  <Fact label={STATS_LABELS.testsCount} value={dash(selected.tests.count)} />
                  <Fact label={STATS_LABELS.invited} value={dash(selected.tests.invites)} />
                  <Fact label={STATS_LABELS.graded} value={dash(selected.tests.notes)} />
                  <Fact label={STATS_LABELS.averageOutOf20} value={dash(selected.tests.moyenne)} />
                  <Fact label={STATS_LABELS.minOutOf20} value={dash(selected.tests.min)} />
                  <Fact label={STATS_LABELS.maxOutOf20} value={dash(selected.tests.max)} />
                  {selected.tests.distribution == null ? null : (
                    <View style={styles.chartBlock}>
                      <UnderlinedTitle style={styles.chartTitle}>{STATS_LABELS.gradesDistribution}</UnderlinedTitle>
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
                      <Text style={styles.testTitle}>{test.titre || STATS_LABELS.testFallback}</Text>
                      <Text style={styles.testMeta}>
                        {test.date ? String(test.date).slice(0, 10) : "—"}
                        {" · "}
                        {STATS_LABELS.invitedShort} {dash(test.invites)}
                        {" · "}
                        {STATS_LABELS.gradedShort} {dash(test.notes)}
                        {" · "}
                        {STATS_LABELS.averageShort} {dash(test.moyenne)}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </SectionCard>

            <SectionCard title={STATS_LABELS.objectifs}>
              {selected.objectifs == null ? (
                <Unavailable />
              ) : (
                <>
                  <Fact label={STATS_LABELS.objectifsFixed} value={dash(selected.objectifs.fixes)} />
                  <Fact label={STATS_LABELS.objectifsAchieved} value={dash(selected.objectifs.atteints)} />
                  <Fact
                    label={STATS_LABELS.objectifsRate}
                    value={dashPct(selected.objectifs.taux)}
                  />
                  <Fact
                    label={STATS_LABELS.objectifsAvg}
                    value={dashPct(selected.objectifs.realisationMoyennePct)}
                  />
                </>
              )}
            </SectionCard>

            <SectionCard
              title={`${STATS_LABELS.seances}: ${dash(selected.seancesTotal ?? selected.bySeance?.length)}`}
            >
              {selected.bySeance == null ? (
                <Unavailable />
              ) : (
                <>
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartTitle}>{STATS_LABELS.seanceHeadcount}</Text>
                    <BarChart
                      items={selected.bySeance.map((seance) => ({
                        key: seance.id,
                        label: seance.name,
                        value: seance.membersCount,
                      }))}
                      height={120}
                      valueSuffix={STATS_LABELS.memberSuffix}
                      emptyLabel={STATS_LABELS.noSeances}
                    />
                  </View>
                  {selected.bySeance.map((seance) => (
                    <View key={seance.id} style={styles.testRow}>
                      <Text style={styles.testTitle}>{seance.name}</Text>
                      <Text style={styles.testMeta}>
                        {STATS_LABELS.members} {dash(seance.membersCount)}
                        {" · "}
                        {STATS_LABELS.presence} {dashPct(seance.presencePct)}
                        {" · "}
                        {STATS_LABELS.gainDuringSeason} {formatHizbOne(seance.gainMoyenHizb)}
                        {" · "}
                        {STATS_LABELS.daysCount} {dash(seance.sessionCount)}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </SectionCard>

            <SectionCard
              title={`${STATS_LABELS.supervisors}: ${dash(selected.supervisorsTotal ?? selected.bySupervisor?.length)}`}
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
                          {names.length > 1 ? `${STATS_LABELS.seances}: ${names.join(STATS_LABELS.listSeparator)}` : "—"}
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
      {isAdmin ? (
        <TouchableOpacity
          style={[
            styles.exportFab,
            { bottom: Math.max(insets.bottom, 16) + 16 },
            fabDisabled && !fabBusy && styles.exportFabDisabled,
          ]}
          disabled={fabDisabled}
          onPress={mode === "compare" ? compareExport.run : exportSelected}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={STATS_LABELS.exportFab}
        >
          {fabBusy ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <Share2 size={16} color="#000000" pointerEvents="none" />
          )}
          <Text style={styles.exportFabText}>{STATS_LABELS.exportFab}</Text>
        </TouchableOpacity>
      ) : null}
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
  exportFab: {
    position: "absolute",
    end: 16,
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFD666",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 10,
  },
  exportFabDisabled: { opacity: 0.5 },
  exportFabText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
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
  memberListTitle: { fontSize: 14, fontWeight: "700", color: palette.textPrimary, marginTop: 4, ...rtlText },
  memberTable: {
    flexDirection: row,
    alignItems: "flex-start",
    backgroundColor: palette.card,
    borderRadius: 12,
    overflow: "hidden",
  },
  memberNameCol: {
    width: MEMBER_NAME_W,
    flexShrink: 0,
    backgroundColor: palette.softGreen,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
  },
  memberHeadName: {
    height: 48,
    width: MEMBER_NAME_W,
    justifyContent: "center",
    paddingHorizontal: 8,
    backgroundColor: palette.softGreen,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  memberNameCell: {
    height: 48,
    width: MEMBER_NAME_W,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  memberNameText: { width: "100%", fontSize: 12, color: palette.textPrimary, ...rtlText },
  memberHeadRow: {
    flexDirection: row,
    height: 48,
    backgroundColor: palette.softGreen,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  memberHeadCell: {
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  memberHeadText: { fontSize: 12, fontWeight: "700", color: palette.textPrimary, textAlign: "center", ...rtlText },
  memberDataRow: {
    flexDirection: row,
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    alignItems: "center",
  },
  memberCell: {
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  memberCellText: { fontSize: 12, color: palette.textPrimary, textAlign: "center" },
  memberPosition: { flexDirection: row, alignItems: "center", justifyContent: "center" },
  memberLtr: { fontSize: 12, color: palette.textPrimary, writingDirection: "ltr", textAlign: "center" },
  memberNegative: { color: palette.red },
  memberAchieved: { color: palette.primary },
  memberMissed: { color: palette.textSecondary },
});
