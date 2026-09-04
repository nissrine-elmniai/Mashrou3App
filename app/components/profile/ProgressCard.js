import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts, row as rtlRow } from "../../constants/rtl";
import { formatHizbTumunDelta, TUMUNS_PER_HIZB } from "../../lib/tumun";
import ProfileFieldRow from "./ProfileFieldRow";

/** Total des hizb du Coran — affichage uniquement, pas une constante API. */
const TOTAL_HIZB = 60;
const LRI = "\u2066";
const PDI = "\u2069";

/** Une décimale ; 0 % et 100 % sans décimale. Isolat LTR pour le point et « % ». */
function formatCardPercent(tumunTotal) {
  const max = TOTAL_HIZB * TUMUNS_PER_HIZB;
  const raw = Math.min(
    100,
    Math.max(0, ((Number(tumunTotal) || 0) / max) * 100)
  );
  if (raw <= 0) return `${LRI}0%${PDI}`;
  if (raw >= 100) return `${LRI}100%${PDI}`;
  const one = Math.round(raw * 10) / 10;
  if (one >= 100) return `${LRI}100%${PDI}`;
  if (one <= 0) return `${LRI}0%${PDI}`;
  return `${LRI}${one.toFixed(1)}%${PDI}`;
}

function PaceLine({ delta, suffix }) {
  const label = formatHizbTumunDelta(delta, suffix);
  if (!label) return null;
  return (
    <Text
      style={[
        styles.paceText,
        delta < 0 ? styles.paceNegative : styles.pacePositive,
      ]}
    >
      {label}
    </Text>
  );
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
  const nbHizb = metrics?.nbHizbCompletes ?? 0;
  const pctLabel = formatCardPercent(metrics?.tumunTotal);
  const seasonDelta = progressState.seasonDeltaTumuns;
  const weekDelta = progressState.weekDeltaTumuns;
  const hasPace =
    (seasonDelta != null && seasonDelta !== 0) ||
    (weekDelta != null && weekDelta !== 0);
  const hasFooter = !!(
    metrics?.dateSaisie ||
    progressState.note ||
    progressState.objectif
  );

  return (
    <>
      <View style={styles.hizbBlock}>
        <Text style={styles.hizbLabel}>الأحزاب المكتملة</Text>
        <View style={styles.hizbRow}>
          <Text style={styles.hizbValue}>{nbHizb}</Text>
          <Text style={styles.hizbDenom}>/ {TOTAL_HIZB}</Text>
        </View>
        <View style={styles.pctRow}>
          <Text style={styles.pctCaption}>التقدم الكلي</Text>
          <Text style={styles.pctValue}>{pctLabel}</Text>
        </View>
      </View>

      {hasPace ? (
        <View style={styles.paceBlock}>
          <PaceLine delta={seasonDelta} suffix="هذا الموسم" />
          <PaceLine delta={weekDelta} suffix="هذا الأسبوع" />
        </View>
      ) : null}

      {hasFooter ? (
        <View style={styles.footerBlock}>
          <View style={styles.footerRule} />
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
              valueStyle={styles.noteValue}
            />
          ) : null}
          {progressState.objectif ? (
            <ProfileFieldRow
              icon="flag-outline"
              label="هدف الموسم"
              value={progressState.objectif}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

/** Carte التقدم — empty state ou métriques existantes. */
export default function ProgressCard({ progressState, onUpdate }) {
  return (
    <View style={[styles.card, shadows.card]}>
      <View style={styles.headerRow}>
        <Text style={styles.cardTitle}>التقدم</Text>
        {onUpdate ? (
          <TouchableOpacity
            style={styles.editPill}
            onPress={onUpdate}
            activeOpacity={0.75}
            accessibilityLabel="تسجيل التقدم"
          >
            <Ionicons name="create-outline" size={radii.lg} color={colors.primary} />
            <Text style={styles.editPillText}>تحديث</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ProgressSectionContent progressState={progressState} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: radii.lg,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: radii.lg,
    color: colors.text,
    flex: 1,
    ...rtlTextBold,
  },
  headerRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    marginBottom: radii.md,
  },
  hizbBlock: {
    gap: radii.sm,
  },
  hizbLabel: {
    fontFamily: fonts.regular,
    fontSize: radii.md,
    color: colors.muted,
    ...rtlText,
  },
  hizbRow: {
    flexDirection: rtlRow,
    alignItems: "baseline",
    justifyContent: "flex-start",
    gap: radii.sm,
  },
  hizbValue: {
    fontFamily: fonts.bold,
    fontSize: radii.xl + radii.md,
    color: colors.text,
    ...rtlTextBold,
  },
  hizbDenom: {
    fontFamily: fonts.semiBold,
    fontSize: radii.lg,
    color: colors.muted,
    ...rtlText,
  },
  pctRow: {
    flexDirection: rtlRow,
    alignItems: "baseline",
    justifyContent: "flex-start",
    gap: radii.sm,
  },
  pctCaption: {
    fontFamily: fonts.regular,
    fontSize: radii.md,
    color: colors.muted,
    ...rtlText,
  },
  pctValue: {
    fontFamily: fonts.semiBold,
    fontSize: radii.lg,
    color: colors.primary,
    ...rtlText,
  },
  paceBlock: {
    marginTop: radii.md,
    gap: radii.sm,
  },
  paceText: {
    fontSize: radii.md,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  pacePositive: {
    color: colors.primary,
  },
  paceNegative: {
    color: colors.orange,
  },
  footerBlock: {
    marginTop: radii.lg,
  },
  footerRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: radii.sm,
  },
  noteValue: {
    flexShrink: 1,
  },
  editPill: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: radii.sm,
    paddingHorizontal: radii.md,
    paddingVertical: radii.sm,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  editPillText: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: radii.md,
    ...rtlText,
  },
  loader: { marginVertical: radii.lg },
  emptyText: {
    fontSize: radii.lg,
    color: colors.muted,
    fontFamily: fonts.regular,
    paddingVertical: radii.lg,
    textAlign: "center",
    ...rtlText,
  },
  errorText: {
    fontSize: radii.lg,
    color: colors.red,
    fontFamily: fonts.regular,
    paddingVertical: radii.sm,
    ...rtlText,
  },
});
