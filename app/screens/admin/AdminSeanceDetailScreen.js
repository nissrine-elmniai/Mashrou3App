import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { rtlText, arrowBack, row } from "../../constants/rtl";
import { formatSeanceScheduleLabel } from "../../lib/seancesApi";
import { getSeancePresenceOverview } from "../../lib/presenceApi";

const palette = {
  primary: "#2E7D32",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
  card: "#FFFFFF",
  muted: "#9E9E9E",
};

function formatDateDisplay(str) {
  if (!str) return "—";
  const raw = String(str).trim().replace(/\//g, "-").slice(0, 10);
  const parts = raw.split("-");
  if (parts.length !== 3) return String(str);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={palette.primary} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatCard({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TopBar({ title, onBack }) {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        hitSlop={12}
        accessibilityLabel="رجوع"
      >
        <Ionicons name={arrowBack} size={22} color={palette.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.topBarTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export default function AdminSeanceDetailScreen({ navigation, route }) {
  const seance = route.params?.seance || null;
  const insets = useSafeAreaInsets();

  const memberCount = (seance?.inscriptions || []).filter(
    (i) => i.statut === "accepte"
  ).length;
  const supervisor = seance?.superviseur || null;
  const supervisorName = supervisor
    ? `${supervisor.first_name || ""} ${supervisor.last_name || ""}`.trim() ||
      supervisor.email
    : null;
  const schedule = formatSeanceScheduleLabel(seance);
  const archived = seance?.statut === "archivee";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overview, setOverview] = useState({
    presentCount: 0,
    absentCount: 0,
    sessionCount: 0,
    byDateRows: [],
  });

  const loadOverview = useCallback(async () => {
    if (!seance?.id) {
      setLoading(false);
      setError("بيانات الحصة غير متوفرة");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getSeancePresenceOverview(seance.id);
    if (!res.ok) {
      setError(res.error || "تعذر تحميل بيانات الحضور");
      setLoading(false);
      return;
    }
    setOverview({
      presentCount: res.presentCount || 0,
      absentCount: res.absentCount || 0,
      sessionCount: res.sessionCount || 0,
      byDateRows: res.byDateRows || [],
    });
    setLoading(false);
  }, [seance?.id]);

  useFocusEffect(
    useCallback(() => {
      loadOverview();
    }, [loadOverview])
  );

  const markedTotal = overview.presentCount + overview.absentCount;
  const attendancePct =
    markedTotal > 0
      ? Math.round((overview.presentCount / markedTotal) * 100)
      : 0;

  if (!seance) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar style="dark" />
        <TopBar title="تفاصيل الحصة" onBack={() => navigation.goBack()} />
        <Text style={styles.emptyText}>الحصة غير موجودة</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />
      <TopBar
        title={seance.nom || "تفاصيل الحصة"}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + Math.max(insets.bottom, 16) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.seanceName}>{seance.nom}</Text>
            <View
              style={[
                styles.statusPill,
                archived ? styles.statusArchived : styles.statusActive,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  archived ? styles.statusArchivedText : styles.statusActiveText,
                ]}
              >
                {archived ? "مؤرشفة" : "نشطة"}
              </Text>
            </View>
          </View>

          <InfoRow icon="calendar-outline" label="اليوم" value={seance.jour} />
          <InfoRow icon="time-outline" label="التوقيت" value={schedule} />
          <InfoRow icon="male-female-outline" label="الجنس" value={seance.genre} />
          <InfoRow icon="person-outline" label="المشرف" value={supervisorName} />
          <InfoRow
            icon="people-outline"
            label="عدد الأعضاء"
            value={String(memberCount)}
          />
          <InfoRow
            icon="play-outline"
            label="تاريخ البداية"
            value={
              seance.date_debut ? formatDateDisplay(seance.date_debut) : null
            }
          />
          <InfoRow
            icon="flag-outline"
            label="تاريخ النهاية"
            value={seance.date_fin ? formatDateDisplay(seance.date_fin) : null}
          />
        </View>

        {loading ? (
          <View style={[styles.card, styles.loadingCard]}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard label="جلسات مسجّلة" value={overview.sessionCount} />
              <StatCard label="نسبة الحضور" value={`${attendancePct}%`} />
            </View>

            <Text style={styles.sectionTitle}>السجل</Text>
            {overview.byDateRows.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>
                  لا توجد سجلات حضور لهذه الحصة بعد
                </Text>
              </View>
            ) : (
              overview.byDateRows.map((rowItem) => {
                const total = rowItem.presentCount + rowItem.absentCount;
                const pct =
                  total > 0
                    ? Math.round((rowItem.presentCount / total) * 100)
                    : 0;
                return (
                  <View key={rowItem.sessionDate} style={styles.sessionRow}>
                    <Text style={styles.sessionDate}>
                      {formatDateDisplay(rowItem.sessionDate)}
                    </Text>
                    <View style={styles.sessionStats}>
                      <Text style={styles.sessionPresent}>
                        حضور {rowItem.presentCount}
                      </Text>
                      <Text style={styles.sessionAbsent}>
                        غياب {rowItem.absentCount}
                      </Text>
                      <Text style={styles.sessionPct}>{pct}%</Text>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  topBar: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backBtn: { padding: 2 },
  topBarTitle: {
    flex: 1,
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    ...rtlText,
  },
  headerSpacer: { width: 26 },
  content: { padding: 16 },
  card: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 14,
  },
  loadingCard: {
    alignItems: "center",
    paddingVertical: 28,
  },
  titleRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  seanceName: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    color: palette.textPrimary,
    ...rtlText,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusActive: { backgroundColor: palette.softGreen },
  statusArchived: { backgroundColor: "#EEEEEE" },
  statusText: { fontSize: 12, fontWeight: "600", ...rtlText },
  statusActiveText: { color: palette.primary },
  statusArchivedText: { color: palette.muted },
  infoRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.softGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTextWrap: { flex: 1 },
  infoLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  infoValue: {
    fontSize: 14,
    color: palette.textPrimary,
    fontWeight: "600",
    marginTop: 2,
    ...rtlText,
  },
  statsRow: {
    flexDirection: row,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: palette.primary,
    ...rtlText,
  },
  statLabel: {
    fontSize: 13,
    color: palette.textSecondary,
    marginTop: 6,
    textAlign: "center",
    ...rtlText,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 10,
    ...rtlText,
  },
  sessionRow: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 8,
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sessionDate: {
    fontWeight: "600",
    color: palette.textPrimary,
    fontSize: 14,
    ...rtlText,
  },
  sessionStats: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  sessionPresent: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: "600",
    ...rtlText,
  },
  sessionAbsent: {
    color: palette.red,
    fontSize: 13,
    fontWeight: "600",
    ...rtlText,
  },
  sessionPct: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "bold",
    minWidth: 36,
    textAlign: "left",
    ...rtlText,
  },
  emptyText: {
    textAlign: "center",
    color: palette.textSecondary,
    paddingVertical: 12,
    marginTop: 8,
    ...rtlText,
  },
  errorText: {
    color: palette.red,
    textAlign: "center",
    ...rtlText,
  },
});
