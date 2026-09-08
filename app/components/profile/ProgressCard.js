import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts, row as rtlRow } from "../../constants/rtl";
import { formatHizbTumunDelta, TUMUNS_PER_HIZB } from "../../lib/tumun";
import ProfileFieldRow from "./ProfileFieldRow";
import ProfileCardHeader from "./ProfileCardHeader";

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

function formatPctLabel(pct) {
  const n = Math.min(100, Math.max(0, Number(pct) || 0));
  if (n <= 0) return `${LRI}0%${PDI}`;
  if (n >= 100) return `${LRI}100%${PDI}`;
  return `${LRI}${n}%${PDI}`;
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

function ObjectifProgressBlock({ objectifProgress, objectif }) {
  if (!objectifProgress) return null;
  const title =
    formatObjectifLabel(objectif) ||
    formatObjectifLabel(objectifProgress.label) ||
    null;
  const pct = Math.min(100, Math.max(0, Number(objectifProgress.pct) || 0));
  return (
    <View style={styles.objectifBlock}>
      <View style={styles.objectifHeader}>
        <Text style={styles.objectifTitle}>هدف الموسم</Text>
        <Text style={styles.objectifPct}>{formatPctLabel(pct)}</Text>
      </View>
      {title ? <Text style={styles.objectifLabel}>{title}</Text> : null}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

/** Libellé هدف الموسم : nb_hizb_cible de la table objectifs (pas le texte libre). */
function formatObjectifLabel(objectif) {
  if (objectif == null || objectif === "") return null;
  if (typeof objectif === "object" && objectif.nbHizbCible != null) {
    return `${objectif.nbHizbCible} حزب`;
  }
  const n = Number(objectif);
  if (Number.isInteger(n) && n >= 1 && n <= TOTAL_HIZB) {
    return `${n} حزب`;
  }
  return null;
}

function ProgressSectionContent({ progressState }) {
  if (progressState.loading) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }
  if (progressState.error) {
    return <Text style={styles.errorText}>{progressState.error}</Text>;
  }

  const metrics = progressState.metrics || null;
  const objectifProgress = progressState.objectifProgress || null;
  const hasMetrics = !!metrics;
  const objectifLabel = formatObjectifLabel(progressState.objectif);

  if (!progressState.hasData) {
    return (
      <>
        <Text style={styles.emptyText}>لم يتم تسجيل أي تقدم بعد</Text>
        {objectifLabel ? (
          <View style={styles.footerBlock}>
            <ProfileFieldRow
              icon="flag-outline"
              label="هدف الموسم"
              value={objectifLabel}
            />
          </View>
        ) : null}
      </>
    );
  }

  const nbHizb = metrics?.nbHizbCompletes ?? 0;
  const pctLabel = formatCardPercent(metrics?.tumunTotal);
  const seasonDelta = progressState.seasonDeltaTumuns;
  const weekDelta = progressState.weekDeltaTumuns;
  const hasPace =
    (seasonDelta != null && seasonDelta !== 0) ||
    (weekDelta != null && weekDelta !== 0);
  const showFooter = !!(
    (!objectifProgress && objectifLabel) ||
    metrics?.dateSaisie ||
    progressState.note
  );

  return (
    <>
      <ObjectifProgressBlock
        objectifProgress={objectifProgress}
        objectif={progressState.objectif}
      />

      {hasMetrics ? (
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
      ) : null}

      {hasPace ? (
        <View style={styles.paceBlock}>
          <PaceLine delta={seasonDelta} suffix="هذا الموسم" />
          <PaceLine delta={weekDelta} suffix="هذا الأسبوع" />
        </View>
      ) : null}

      {showFooter ? (
        <View style={styles.footerBlock}>
          <View style={styles.footerRule} />
          {!objectifProgress && objectifLabel ? (
            <ProfileFieldRow
              icon="flag-outline"
              label="هدف الموسم"
              value={objectifLabel}
            />
          ) : null}
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
        </View>
      ) : null}
    </>
  );
}

/** Carte التقدم — empty state ou métriques existantes. */
export default function ProgressCard({ progressState, onUpdate }) {
  return (
    <View style={[styles.card, shadows.card]}>
      <ProfileCardHeader
        title="التقدم"
        onAction={onUpdate}
        accessibilityLabel="تسجيل التقدم"
      />
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
  objectifBlock: {
    backgroundColor: colors.soft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: radii.md,
    marginBottom: radii.lg,
    gap: radii.sm,
  },
  objectifHeader: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "space-between",
  },
  objectifTitle: {
    fontFamily: fonts.semiBold,
    fontSize: radii.md,
    color: colors.primary,
    ...rtlText,
  },
  objectifPct: {
    fontFamily: fonts.bold,
    fontSize: radii.lg,
    color: colors.primary,
    ...rtlTextBold,
  },
  objectifLabel: {
    fontFamily: fonts.regular,
    fontSize: radii.md,
    color: colors.text,
    ...rtlText,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.card,
    overflow: "hidden",
    marginTop: 4,
    direction: "rtl",
  },
  barFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 4,
    alignSelf: "flex-start",
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
