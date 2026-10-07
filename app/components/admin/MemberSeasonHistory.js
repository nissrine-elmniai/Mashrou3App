import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SEASON_TYPES } from "../../constants/roles";
import { row, rtlText } from "../../constants/rtl";
import { getMemberSeasonHistory } from "../../lib/seasonStatsApi";
import { STATS_LABELS } from "../../lib/statsLabels";
import { TUMUNS_PER_HIZB, formatHizbCount } from "../../lib/tumun";

const palette = {
  primary: "#2E7D32",
  red: "#D32F2F",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
  card: "#FFFFFF",
  softGreen: "#E8F5E9",
};

function dash(value) {
  return value == null || value === "" ? "—" : String(value);
}

function seasonYear(startDate) {
  const year = String(startDate || "").slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function hizbOne(tumun) {
  if (tumun == null || tumun === "") return "—";
  const n = Number(tumun) / TUMUNS_PER_HIZB;
  if (!Number.isFinite(n)) return "—";
  const text = `${(Math.round(n * 10) / 10).toFixed(1)} ${STATS_LABELS.unitHizb}`;
  return n < 0 ? `\u200E${text}` : text;
}

function scoreOutOf20(row) {
  const notes = Number(row?.testsNotes);
  const average = Number(row?.noteMoyenne);
  if (!Number.isFinite(notes) || notes <= 0 || !Number.isFinite(average)) return "—";
  return `\u2066${Math.round(average * 10) / 10}${STATS_LABELS.unitScore}\u2069`;
}

function PositionLine({ debut, fin }) {
  const start = hizbOne(debut);
  const end = hizbOne(fin);
  if (start === "—" && end === "—") return <Text style={styles.line}>—</Text>;
  return (
    <View style={styles.positionRow}>
      <Text style={styles.ltrBit}>{start}</Text>
      <Text style={styles.line}> ← </Text>
      <Text style={styles.ltrBit}>{end}</Text>
    </View>
  );
}

function formatGain(gainTumun) {
  if (gainTumun == null) return "—";
  const hizb = Number(gainTumun) / TUMUNS_PER_HIZB;
  if (!Number.isFinite(hizb)) return "—";
  const rounded = Math.round(hizb * 100) / 100;
  return `${rounded} ${STATS_LABELS.unitHizb}`;
}

function SeasonCard({ row }) {
  const year = seasonYear(row.startDate);
  const title = year ? `${row.name || STATS_LABELS.seasonFallback} · ${year}` : row.name || STATS_LABELS.seasonFallback;
  const rattrapage = row.source === "rattrapage";
  return (
    <View style={styles.seasonCard}>
      <Text style={styles.seasonTitle}>{title}</Text>
      {rattrapage ? (
        <>
          <Text style={styles.note}>{STATS_LABELS.progressOnly}</Text>
          <PositionLine debut={row.posDebut} fin={row.posFin} />
          <Text style={styles.line}>
            {STATS_LABELS.gainHistory}: {formatGain(row.gainTumun)}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.line}>{STATS_LABELS.seance}: {dash(row.seanceNom)}</Text>
          <Text style={styles.line}>{STATS_LABELS.supervisor}: {dash(row.superviseurNom)}</Text>
          <Text style={styles.line}>
            {STATS_LABELS.presence}: {row.presencePct == null ? "—" : `${row.presencePct}${STATS_LABELS.unitPercent}`}
          </Text>
          <PositionLine debut={row.posDebut} fin={row.posFin} />
          <Text style={styles.line}>
            {STATS_LABELS.gainHistory}: {formatGain(row.gainTumun)}
          </Text>
          <Text style={styles.line}>
            {STATS_LABELS.tests}: {scoreOutOf20(row)}
          </Text>
          <Text style={styles.line}>
            {STATS_LABELS.goal}:{" "}
            {row.objectifCible == null
              ? "—"
              : `${formatHizbCount(row.objectifCible)} · ${
                  row.objectifAtteint ? STATS_LABELS.achievedMark : STATS_LABELS.notAchievedMark
                }`}
          </Text>
        </>
      )}
    </View>
  );
}

function Group({ title, rows }) {
  if (!rows.length) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {rows.map((row) => (
        <SeasonCard key={row.saisonId} row={row} />
      ))}
    </View>
  );
}

/** Historique figé. Une ligne rattrapage n'a que la progression. */
export default function MemberSeasonHistory({ membreId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(null);
        const res = await getMemberSeasonHistory(membreId);
        if (cancelled) return;
        setLoading(false);
        if (!res.ok) {
          setRows([]);
          setError(res.error || STATS_LABELS.historyLoadError);
          return;
        }
        setRows(res.rows || []);
      })();
      return () => {
        cancelled = true;
      };
    }, [membreId, reloadKey])
  );

  const regular = rows.filter((row) => row.type !== SEASON_TYPES.SUMMER);
  const summer = rows.filter((row) => row.type === SEASON_TYPES.SUMMER);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{STATS_LABELS.historyTitle}</Text>
      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={palette.primary} />
          <Text style={styles.stateText}>{STATS_LABELS.loadingData}</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => setReloadKey((n) => n + 1)}>
            <Text style={styles.retryText}>{STATS_LABELS.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.stateText}>{STATS_LABELS.historyEmpty}</Text>
      ) : (
        <>
          <Group title={STATS_LABELS.seasonsRegular} rows={regular} />
          <Group title={STATS_LABELS.seasonsSummer} rows={summer} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: "800", color: palette.textPrimary, ...rtlText },
  group: { gap: 8 },
  groupTitle: { fontWeight: "700", color: palette.primary, ...rtlText },
  seasonCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    padding: 10,
    gap: 4,
    backgroundColor: palette.softGreen,
  },
  seasonTitle: { fontWeight: "800", color: palette.textPrimary, ...rtlText },
  line: { color: palette.textPrimary, fontSize: 13, ...rtlText },
  positionRow: { flexDirection: row, alignItems: "center" },
  ltrBit: { color: palette.textPrimary, fontSize: 13, writingDirection: "ltr" },
  note: { color: palette.textSecondary, fontSize: 12, ...rtlText },
  state: { alignItems: "center", gap: 8, paddingVertical: 8 },
  stateText: { color: palette.textSecondary, ...rtlText },
  error: { color: palette.red, textAlign: "center", ...rtlText },
  retry: { backgroundColor: palette.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { color: "#fff", fontWeight: "700", ...rtlText },
});
