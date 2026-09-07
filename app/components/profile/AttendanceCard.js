import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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

function PresenceMiniRow({ date, status }) {
  const label = PRESENCE_LABELS[status] || status;
  const statusColor = STATUS_COLORS[status] || colors.muted;
  return (
    <View style={styles.presenceMiniRow}>
      <Text style={styles.presenceMiniDate}>{date || "—"}</Text>
      <Text style={[styles.presenceMiniStatus, { color: statusColor }]}>
        {label}
      </Text>
    </View>
  );
}

function AttendanceBody({ presenceState }) {
  const monthGroups = useMemo(
    () => groupMemberPresenceByMonth(presenceState.records || []),
    [presenceState.records]
  );
  const [monthIndex, setMonthIndex] = useState(0);

  useEffect(() => {
    setMonthIndex(0);
  }, [presenceState.records]);

  if (presenceState.loading) {
    return <ActivityIndicator color={colors.primary} style={styles.loader} />;
  }
  if (presenceState.error) {
    return <Text style={styles.errorText}>{presenceState.error}</Text>;
  }
  if (!presenceState.hasData) {
    return <Text style={styles.emptyText}>لا يوجد سجل حضور بعد</Text>;
  }

  const currentMonth = monthGroups[monthIndex] || null;
  const canGoOlder = monthIndex < monthGroups.length - 1;
  const canGoNewer = monthIndex > 0;
  const showMonthNav = monthGroups.length > 1;

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
      {currentMonth ? (
        <>
          {!showMonthNav ? (
            <Text style={styles.monthNavLabelStatic}>{currentMonth.label}</Text>
          ) : null}
          <View style={styles.presenceList}>
            {currentMonth.rows.map((rec, idx) => (
              <PresenceMiniRow
                key={`${rec.date}_${rec.status}_${idx}`}
                date={rec.date}
                status={rec.status}
              />
            ))}
          </View>
          {showMonthNav ? (
            <View style={styles.monthNavBar}>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setMonthIndex((i) => i + 1)}
                disabled={!canGoOlder}
                activeOpacity={0.7}
                accessibilityLabel="الشهر السابق"
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={canGoOlder ? colors.primary : colors.placeholder}
                />
              </TouchableOpacity>
              <Text style={styles.monthNavLabel}>{currentMonth.label}</Text>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setMonthIndex((i) => i - 1)}
                disabled={!canGoNewer}
                activeOpacity={0.7}
                accessibilityLabel="الشهر التالي"
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={canGoNewer ? colors.primary : colors.placeholder}
                />
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** Carte الحضور — totaux + un mois à la fois (même présentation que la fiche superviseur). */
export default function AttendanceCard({ presenceState }) {
  const title =
    !presenceState.loading &&
    presenceState.rate != null &&
    presenceState.rate !== 0
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
    borderRadius: radii.lg,
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
  presenceList: { marginTop: 8 },
  presenceMiniRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  presenceMiniDate: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  presenceMiniStatus: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  monthNavBar: {
    flexDirection: "row",
    direction: "ltr",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  monthNavBtn: {
    padding: 6,
    minWidth: 32,
    alignItems: "center",
  },
  monthNavLabel: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
    textAlign: "center",
    ...rtlText,
  },
  monthNavLabelStatic: {
    fontFamily: fonts.semiBold,
    fontSize: 14,
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
    textAlign: "center",
    ...rtlText,
  },
});
