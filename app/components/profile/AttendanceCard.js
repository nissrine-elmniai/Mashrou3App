import React, { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, rtlTextBold, fonts, row as rtlRow } from "../../constants/rtl";
import { groupMemberPresenceByMonth } from "../../screens/supervisor/supervisorAttendanceHelpers";
import ProfileFieldRow from "./ProfileFieldRow";

const PRESENCE_LABELS = {
  present: "حاضر",
  absent: "غائب",
};

const STATUS_COLORS = {
  present: colors.green,
  absent: colors.red,
};

function arabicSessionCountLabel(count) {
  const n = Number(count) || 0;
  if (n === 0) return "0 حصة";
  if (n === 1) return "حصة واحدة";
  if (n === 2) return "حصتين";
  return `${n} حصص`;
}

function PresenceRecordRow({ date, status }) {
  const label = PRESENCE_LABELS[status] || status;
  const statusColor = STATUS_COLORS[status] || colors.muted;
  // rtlRow : date à droite, statut à gauche
  return (
    <View style={styles.recordRow}>
      <Text style={styles.recordDate}>{date || "—"}</Text>
      <Text style={[styles.recordStatus, { color: statusColor }]}>{label}</Text>
    </View>
  );
}

function AttendanceBody({ presenceState }) {
  const monthGroups = useMemo(
    () => groupMemberPresenceByMonth(presenceState.records || []),
    [presenceState.records]
  );

  if (presenceState.loading) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }
  if (presenceState.error) {
    return <Text style={styles.errorText}>{presenceState.error}</Text>;
  }
  if (!presenceState.hasData) {
    return <Text style={styles.emptyText}>لا يوجد سجل حضور بعد</Text>;
  }

  return (
    <>
      <ProfileFieldRow
        icon="checkmark-circle"
        label="إجمالي الحضور"
        value={arabicSessionCountLabel(presenceState.presentCount ?? 0)}
        iconColor={STATUS_COLORS.present}
        valueStyle={styles.statValue}
      />
      <ProfileFieldRow
        icon="close-circle"
        label="إجمالي الغياب"
        value={arabicSessionCountLabel(presenceState.absentCount ?? 0)}
        iconColor={STATUS_COLORS.absent}
        valueStyle={styles.statValue}
      />
      {monthGroups.map((month) => (
        <View key={month.monthKey} style={styles.monthBlock}>
          <Text style={styles.monthLabel}>{month.label}</Text>
          {month.rows.map((rec, idx) => (
            <PresenceRecordRow
              key={`${rec.date}_${rec.status}_${idx}`}
              date={rec.date}
              status={rec.status}
            />
          ))}
        </View>
      ))}
    </>
  );
}

/** Carte الحضور (%X) — totaux + mois empilés. */
export default function AttendanceCard({ presenceState }) {
  const title =
    !presenceState.loading && presenceState.rate != null
      ? `الحضور (${presenceState.rate}%)`
      : "الحضور";

  return (
    <View style={[styles.card, shadows.card]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <AttendanceBody presenceState={presenceState} />
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
  statValue: {
    color: colors.muted,
  },
  loader: { marginVertical: 16 },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.regular,
    paddingVertical: 8,
    ...rtlText,
  },
  errorText: {
    fontSize: 14,
    color: colors.red,
    fontFamily: fonts.regular,
    paddingVertical: 8,
    ...rtlText,
  },
  monthBlock: {
    marginTop: 12,
  },
  monthLabel: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
    marginBottom: 6,
    ...rtlTextBold,
  },
  recordRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recordStatus: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  recordDate: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.medium,
    ...rtlText,
  },
});
