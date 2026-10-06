import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SEASON_TYPES } from "../../constants/roles";
import { rtlText, row } from "../../constants/rtl";
import { listSeasonStatsByType } from "../../lib/seasonStatsApi";
import { BarChart, UnderlinedTitle } from "../stats/StatsCharts";

const palette = {
  primary: "#2E7D32",
  red: "#D32F2F",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
  card: "#FFFFFF",
  softGreen: "#E8F5E9",
};

const INDICATORS = [
  { key: "members", label: "الأعضاء", suffix: "" },
  { key: "presence", label: "الحضور %", suffix: "" },
  { key: "gain", label: "متوسط الحفظ", suffix: " حزب" },
  { key: "tests", label: "معدل الاختبارات /20", suffix: "" },
  { key: "objectifs", label: "تحقيق الأهداف", suffix: "" },
];

const BAR_WIDTH = 56;
const BAR_GAP = 16;

function seasonYear(startDate) {
  const year = String(startDate || "").slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function seasonLabel(view) {
  const year = seasonYear(view?.startDate);
  const name = view?.name || "موسم";
  return year ? `${name} · ${year}` : name;
}

function kpiOf(view) {
  if (!view || view.empty) {
    return { members: null, presence: null, gain: null, tests: null, objectifs: null };
  }
  return {
    members: view.effectifs?.membres ?? null,
    presence: view.presence?.pct ?? null,
    gain: view.progression?.gainMoyenHizb ?? null,
    tests: view.tests?.moyenne ?? null,
    objectifs: view.objectifs?.taux ?? null,
  };
}

function cell(value, indicator) {
  if (value == null || value === "") return "—";
  if (indicator.key !== "gain") return `${value}${indicator.suffix}`;
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const text = `${n.toFixed(1)} حزب`;
  return n < 0 ? `\u200E${text}` : text;
}

function formatChartValue(indicator) {
  if (indicator.key !== "gain") return undefined;
  return (value) => {
    if (value == null || !Number.isFinite(value)) return "—";
    const text = `${value.toFixed(1)} حزب`;
    return value < 0 ? `\u200E${text}` : text;
  };
}

/** Chronologique, saison en cours en dernier. Jamais de mélange de types. */
function orderedViews(views) {
  const closed = (views || [])
    .filter((view) => !view.active)
    .sort((a, b) =>
      String(a.startDate || a.snapshotAt || "").localeCompare(String(b.startDate || b.snapshotAt || ""))
    );
  const active = (views || []).filter((view) => view.active);
  return [...closed, ...active];
}

export default function SeasonsCompareView({ initialType }) {
  const requestId = useRef(0);
  const typeTouched = useRef(false);
  const [type, setType] = useState(
    initialType === SEASON_TYPES.SUMMER ? SEASON_TYPES.SUMMER : SEASON_TYPES.REGULAR
  );
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeTouched.current) return;
    setType(initialType === SEASON_TYPES.SUMMER ? SEASON_TYPES.SUMMER : SEASON_TYPES.REGULAR);
  }, [initialType]);

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
    setViews(orderedViews(res.seasons || []));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(type);
    }, [load, type])
  );

  const pickType = (next) => {
    if (next === type) return;
    typeTouched.current = true;
    setType(next);
    setViews([]);
    setLoading(true);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.switchRow}>
        <TouchableOpacity
          style={[styles.switchBtn, type === SEASON_TYPES.REGULAR && styles.switchBtnOn]}
          onPress={() => pickType(SEASON_TYPES.REGULAR)}
        >
          <Text style={[styles.switchText, type === SEASON_TYPES.REGULAR && styles.switchTextOn]}>
            عادية
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchBtn, type === SEASON_TYPES.SUMMER && styles.switchBtnOn]}
          onPress={() => pickType(SEASON_TYPES.SUMMER)}
        >
          <Text style={[styles.switchText, type === SEASON_TYPES.SUMMER && styles.switchTextOn]}>
            صيفية
          </Text>
        </TouchableOpacity>
      </View>

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
      ) : views.length < 2 ? (
        <Text style={styles.emptyHint}>لا توجد مواسم كافية للمقارنة</Text>
      ) : (
        <>
          {INDICATORS.map((indicator) => (
            <View key={indicator.key} style={styles.card}>
              <UnderlinedTitle style={styles.cardTitle}>{indicator.label}</UnderlinedTitle>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chartScroll}
              >
                <BarChart
                  items={views.map((view) => ({
                    key: view.saisonId,
                    label: view.name || "موسم",
                    caption: seasonYear(view.startDate),
                    value: kpiOf(view)[indicator.key],
                  }))}
                  height={200}
                  barWidth={BAR_WIDTH}
                  barGap={BAR_GAP}
                  paddingTop={0}
                  hideNonPositive
                  valueSuffix={indicator.key === "gain" ? "" : indicator.suffix}
                  formatValue={formatChartValue(indicator)}
                />
              </ScrollView>
            </View>
          ))}

          <View style={styles.tableWrap}>
            <View style={styles.nameCol}>
              <View style={styles.headName}>
                <Text style={styles.headText} numberOfLines={1}>
                  الموسم
                </Text>
              </View>
              {views.map((view) => (
                <View key={view.saisonId} style={styles.nameCell}>
                  <Text style={styles.nameText} numberOfLines={1} ellipsizeMode="tail">
                    {seasonLabel(view)}
                  </Text>
                </View>
              ))}
            </View>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.tableScroll}
            >
              <View>
                <View style={styles.headRow}>
                  {INDICATORS.map((indicator) => (
                    <View key={indicator.key} style={styles.headCell}>
                      <Text style={styles.headText} numberOfLines={2}>
                        {indicator.label}
                      </Text>
                    </View>
                  ))}
                </View>
                {views.map((view) => {
                  const kpi = kpiOf(view);
                  return (
                    <View key={view.saisonId} style={styles.dataRow}>
                      {INDICATORS.map((indicator) => {
                        const value = kpi[indicator.key];
                        const negative = indicator.key === "gain" && Number(value) < 0;
                        return (
                          <View key={indicator.key} style={styles.dataCell}>
                            <Text
                              style={[styles.valueText, negative ? styles.negativeCell : null]}
                              numberOfLines={1}
                            >
                              {cell(value, indicator)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  switchRow: { flexDirection: row, gap: 8 },
  switchBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "transparent",
  },
  switchBtnOn: { borderColor: palette.primary },
  switchText: { color: palette.textSecondary, fontSize: 13, fontWeight: "700", ...rtlText },
  switchTextOn: { color: palette.primary },
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
  card: { backgroundColor: palette.card, borderRadius: 12, padding: 14, gap: 8 },
  cardTitle: { fontWeight: "800", color: palette.textPrimary, ...rtlText },
  chartScroll: { paddingBottom: 4 },
  tableWrap: {
    flexDirection: row,
    backgroundColor: palette.card,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "flex-start",
  },
  nameCol: {
    width: 150,
    flexShrink: 0,
    backgroundColor: palette.softGreen,
    borderLeftWidth: 1,
    borderLeftColor: palette.border,
  },
  tableScroll: { flex: 1 },
  headName: {
    height: 40,
    width: 150,
    justifyContent: "center",
    paddingHorizontal: 8,
    backgroundColor: palette.softGreen,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  nameCell: {
    height: 48,
    width: 150,
    justifyContent: "center",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  nameText: { width: "100%", fontSize: 12, color: palette.textPrimary, ...rtlText },
  headRow: {
    flexDirection: row,
    height: 40,
    backgroundColor: palette.softGreen,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headCell: {
    width: 90,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  headText: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.textPrimary,
    textAlign: "center",
  },
  dataRow: {
    flexDirection: row,
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  dataCell: {
    width: 90,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  valueText: { fontSize: 12, color: palette.textPrimary, textAlign: "center" },
  negativeCell: { color: palette.red },
});
