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
import { rtlText } from "../../constants/rtl";
import { getMemberSeasonHistory } from "../../lib/seasonStatsApi";
import { TUMUNS_PER_HIZB, formatHizbCount, tumunStoredToUi } from "../../lib/tumun";

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

function formatPosition(tumun) {
  if (tumun == null) return "—";
  const n = Number(tumun);
  if (!Number.isFinite(n)) return "—";
  const hizb = Math.floor(n / TUMUNS_PER_HIZB);
  const rest = tumunStoredToUi(n % TUMUNS_PER_HIZB);
  return `${formatHizbCount(hizb)} · الثمن ${rest}`;
}

function formatGain(gainTumun) {
  if (gainTumun == null) return "—";
  const hizb = Number(gainTumun) / TUMUNS_PER_HIZB;
  if (!Number.isFinite(hizb)) return "—";
  const rounded = Math.round(hizb * 100) / 100;
  return `${rounded} حزب`;
}

function SeasonCard({ row }) {
  const year = seasonYear(row.startDate);
  const title = year ? `${row.name || "موسم"} · ${year}` : row.name || "موسم";
  const rattrapage = row.source === "rattrapage";
  return (
    <View style={styles.seasonCard}>
      <Text style={styles.seasonTitle}>{title}</Text>
      {rattrapage ? (
        <>
          <Text style={styles.note}>بيانات التقدم فقط</Text>
          <Text style={styles.line}>
            من {formatPosition(row.posDebut)} إلى {formatPosition(row.posFin)}
          </Text>
          <Text style={styles.line}>حفظ خلال الموسم: {formatGain(row.gainTumun)}</Text>
        </>
      ) : (
        <>
          <Text style={styles.line}>الحصة: {dash(row.seanceNom)}</Text>
          <Text style={styles.line}>المشرف: {dash(row.superviseurNom)}</Text>
          <Text style={styles.line}>
            الحضور: {row.presencePct == null ? "—" : `${row.presencePct}%`}
          </Text>
          <Text style={styles.line}>
            من {formatPosition(row.posDebut)} إلى {formatPosition(row.posFin)}
          </Text>
          <Text style={styles.line}>حفظ خلال الموسم: {formatGain(row.gainTumun)}</Text>
          <Text style={styles.line}>
            الاختبارات: {dash(row.testsNotes)} · المعدل {dash(row.noteMoyenne)}/20
          </Text>
          <Text style={styles.line}>
            الهدف:{" "}
            {row.objectifCible == null
              ? "—"
              : `${formatHizbCount(row.objectifCible)} · ${
                  row.objectifAtteint ? "مُحقَّق" : "غير مُحقَّق"
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
          setError(res.error || "تعذر تحميل السجل");
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
      <Text style={styles.title}>سجل المواسم</Text>
      {loading ? (
        <View style={styles.state}>
          <ActivityIndicator color={palette.primary} />
          <Text style={styles.stateText}>جاري تحميل الإحصائيات…</Text>
        </View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => setReloadKey((n) => n + 1)}>
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.stateText}>لا يوجد سجل مواسم لهذا العضو</Text>
      ) : (
        <>
          <Group title="المواسم العادية" rows={regular} />
          <Group title="المدارس الصيفية" rows={summer} />
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
  note: { color: palette.textSecondary, fontSize: 12, ...rtlText },
  state: { alignItems: "center", gap: 8, paddingVertical: 8 },
  stateText: { color: palette.textSecondary, ...rtlText },
  error: { color: palette.red, textAlign: "center", ...rtlText },
  retry: { backgroundColor: palette.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { color: "#fff", fontWeight: "700", ...rtlText },
});
