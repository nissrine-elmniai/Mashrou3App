import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts } from "../../constants/rtl";
import ProfileFieldRow from "./ProfileFieldRow";

function deriveLevel(pct) {
  if (pct >= 70) return "متقدم";
  if (pct >= 35) return "متوسط";
  return "مبتدئ";
}

function formatTumunCourant(metrics) {
  if (metrics?.tumunCourant == null) return "—";
  return String(metrics.tumunCourant);
}

function ProgressSectionContent({ progressState }) {
  if (progressState.loading) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }
  if (progressState.error) {
    return <Text style={styles.errorText}>{progressState.error}</Text>;
  }
  if (!progressState.hasData) {
    return <Text style={styles.emptyText}>لم يتم تسجيل أي تقدم بعد</Text>;
  }

  const metrics = progressState.metrics;
  const globalPct = metrics?.globalPct ?? 0;

  return (
    <>
      <ProfileFieldRow
        icon="analytics-outline"
        label="النسبة الإجمالية"
        value={`${globalPct}%`}
      />
      <ProfileFieldRow
        icon="ribbon-outline"
        label="المستوى"
        value={deriveLevel(globalPct)}
      />
      <ProfileFieldRow
        icon="book-outline"
        label="الجزء الحالي"
        value={String(metrics?.juzeCourant ?? "")}
      />
      <ProfileFieldRow
        icon="layers-outline"
        label="الثمن الحالي"
        value={formatTumunCourant(metrics)}
      />
      <ProfileFieldRow
        icon="checkmark-done-outline"
        label="آخر حزب مكتمل"
        value={String(metrics?.nbHizbCompletes ?? 0)}
      />
      {metrics?.dateSaisie ? (
        <ProfileFieldRow
          icon="calendar-outline"
          label="تاريخ آخر تحديث"
          value={String(metrics.dateSaisie).slice(0, 10)}
        />
      ) : null}
      {progressState.note ? (
        <ProfileFieldRow
          icon="document-text-outline"
          label="ملاحظة"
          value={progressState.note}
        />
      ) : null}
      {progressState.objectif ? (
        <ProfileFieldRow
          icon="flag-outline"
          label="هدف الموسم"
          value={progressState.objectif}
        />
      ) : null}
    </>
  );
}

/** Carte التقدم — empty state ou métriques existantes. */
export default function ProgressCard({ progressState }) {
  return (
    <View style={[styles.card, shadows.card]}>
      <Text style={styles.cardTitle}>التقدم</Text>
      <ProgressSectionContent progressState={progressState} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 16,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
    ...rtlTextBold,
  },
  loader: { marginVertical: 16 },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.regular,
    paddingVertical: 16,
    textAlign: "center",
    ...rtlText,
  },
  errorText: {
    fontSize: 14,
    color: colors.red,
    fontFamily: fonts.regular,
    paddingVertical: 8,
    ...rtlText,
  },
});
