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
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts, arrowBack, row } from "../../constants/rtl";
import { formatSeanceScheduleLabel } from "../../lib/seancesApi";
import { getSeancePresenceOverview } from "../../lib/presenceApi";

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
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatCard({ label, value, color = colors.primary }) {
  return (
    <View style={[styles.statCard, shadows.card]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name={arrowBack} size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>تفاصيل الحصة</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.emptyText}>الحصة غير موجودة</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="رجوع"
        >
          <Ionicons name={arrowBack} size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {seance.nom || "تفاصيل الحصة"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + Math.max(insets.bottom, 16) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, shadows.card]}>
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
          <View style={[styles.card, shadows.card, styles.loadingCard]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={[styles.card, shadows.card]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard
                label="جلسات مسجّلة"
                value={overview.sessionCount}
                color={colors.orange}
              />
              <StatCard
                label="نسبة الحضور"
                value={`${attendancePct}%`}
                color={colors.primary}
              />
            </View>

            <Text style={styles.sectionTitle}>السجل</Text>
            {overview.byDateRows.length === 0 ? (
              <View style={[styles.card, shadows.card]}>
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
                  <View
                    key={rowItem.sessionDate}
                    style={[styles.sessionRow, shadows.card]}
                  >
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
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.primary,
  },
  backBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  headerSpacer: { width: 26 },
  content: { padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    fontFamily: fonts.bold,
    color: colors.text,
    ...rtlTextBold,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  statusActive: { backgroundColor: colors.soft },
  statusArchived: { backgroundColor: "#EEEEEE" },
  statusText: { fontSize: 12, fontFamily: fonts.semiBold, ...rtlText },
  statusActiveText: { color: colors.primary },
  statusArchivedText: { color: colors.muted },
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
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTextWrap: { flex: 1 },
  infoLabel: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    fontFamily: fonts.semiBold,
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
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  statLabel: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    textAlign: "center",
    ...rtlText,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 10,
    ...rtlTextBold,
  },
  sessionRow: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sessionDate: {
    fontFamily: fonts.semiBold,
    color: colors.text,
    fontSize: 14,
    ...rtlText,
  },
  sessionStats: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  sessionPresent: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  sessionAbsent: {
    color: colors.red,
    fontSize: 13,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  sessionPct: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.bold,
    minWidth: 36,
    textAlign: "left",
    ...rtlText,
  },
  emptyText: {
    textAlign: "center",
    color: colors.muted,
    paddingVertical: 12,
    ...rtlText,
  },
  errorText: {
    color: colors.red,
    textAlign: "center",
    ...rtlText,
  },
});
