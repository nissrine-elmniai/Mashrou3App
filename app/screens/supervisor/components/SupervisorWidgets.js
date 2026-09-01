import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../../../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../../../constants/rtl";
import { STATUS_COLORS, initials } from "../supervisorHelpers";

export function MiniStat({ value, label, color }) {
  return (
    <View style={[styles.miniStat, shadows.card]}>
      <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

export function OutlineButton({ label, icon, onPress }) {
  return (
    <TouchableOpacity style={styles.outlineBtn} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.outlineBtnText}>{label}</Text>
      {icon ? <Ionicons name={icon} size={20} color={colors.muted} /> : null}
    </TouchableOpacity>
  );
}

export function MemberRow({ member, onMessage, onOpenProfile }) {
  const showStatusDot = member.status === "present" || member.status === "absent";
  const statusColor = STATUS_COLORS[member.status];
  const name = `${member.user.firstName} ${member.user.lastName}`;
  return (
    <View style={[styles.memberRowCard, shadows.card]}>
      <TouchableOpacity
        style={styles.memberMainArea}
        onPress={onOpenProfile}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrap}>
          <View style={styles.memberAvatar}>
            <Text style={styles.memberAvatarText}>{initials(member.user.firstName)}</Text>
          </View>
          {showStatusDot ? (
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          ) : null}
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{name}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.msgIconBtn} onPress={onMessage}>
        <Ionicons name="chatbubble-outline" size={20} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

export function AttendanceHistoryRow({
  sessionDate,
  presentCount,
  absentCount,
  pct,
  isMarked,
  memberTotal,
  markingHint,
  highlightUnmarked = false,
  unmarkedPrompt,
  onPress,
}) {
  const dateLabel = String(sessionDate || "").replace(/-/g, "/");
  const showStats = isMarked;
  const total =
    memberTotal > 0 ? memberTotal : presentCount + absentCount;
  const presentPct =
    total > 0 ? Math.round((presentCount / total) * 100) : pct ?? 0;

  const rowStyle = [
    styles.historyRow,
    shadows.card,
    highlightUnmarked && styles.historyRowUnmarked,
  ];

  const content = (
    <>
      <Text style={styles.historyDate}>{dateLabel}</Text>
      {markingHint && !highlightUnmarked ? (
        <Text style={styles.historyMarkingHint}>{markingHint}</Text>
      ) : null}
      {showStats ? (
        <Text style={styles.historyStatMuted}>نسبة الحضور {presentPct}%</Text>
      ) : (
        <Text style={styles.historyUnset}>غير مسجل</Text>
      )}
      {highlightUnmarked && unmarkedPrompt ? (
        <Text style={styles.historyUnmarkedPrompt}>{unmarkedPrompt}</Text>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={rowStyle}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={rowStyle}>{content}</View>;
}

export function AttendanceRow({
  name,
  initial,
  value,
  onToggle,
  readOnly = false,
  unset = false,
  statusLabel: statusLabelProp,
}) {
  const statusLabel =
    statusLabelProp ?? (unset ? "غير مسجل" : value ? "حاضر" : "غائب");
  const statusColor = unset
    ? STATUS_COLORS.none
    : value
    ? STATUS_COLORS.present
    : STATUS_COLORS.absent;

  return (
    <View style={[styles.attendanceRow, shadows.card]}>
      <View style={styles.attendanceLeft}>
        <View style={styles.memberAvatar}>
          <Text style={styles.memberAvatarText}>{initial}</Text>
        </View>
        <Text style={styles.attendanceName}>{name}</Text>
      </View>
      <View style={styles.attendanceRight}>
        <Text style={[styles.attendanceStatusText, { color: statusColor }]}>
          {statusLabel}
        </Text>
        {readOnly ? null : (
          <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: colors.border, true: `${colors.gold}90` }}
            thumbColor={value ? colors.gold : "#FFFFFF"}
          />
        )}
      </View>
    </View>
  );
}

export function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  miniStat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  miniStatValue: { fontSize: 20, fontFamily: fonts.bold },
  miniStatLabel: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
    textAlign: "center",
    fontFamily: fonts.regular,
  },

  outlineBtn: {
    flexDirection: row,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  outlineBtnText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 15, ...rtlText },

  memberRowCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 12,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
  },
  memberMainArea: { flex: 1, flexDirection: row, alignItems: "center", gap: 12 },
  avatarWrap: { position: "relative" },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 15 },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.card,
  },
  memberInfo: { flex: 1 },
  memberName: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, ...rtlTextBold },
  msgIconBtn: { padding: 8 },

  attendanceRow: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 10,
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
  },
  attendanceLeft: { flexDirection: row, alignItems: "center", gap: 10 },
  attendanceName: { fontFamily: fonts.semiBold, fontSize: 14, color: colors.text, ...rtlText },
  attendanceRight: { flexDirection: row, alignItems: "center", gap: 8 },
  attendanceStatusText: { fontSize: 13, fontFamily: fonts.medium },

  historyRow: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 10,
  },
  historyRowUnmarked: {
    backgroundColor: colors.goldSoft,
  },
  historyDate: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
    ...rtlText,
  },
  historyMarkingHint: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.green,
    marginBottom: 6,
    ...rtlText,
  },
  historyStats: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    ...rtlText,
  },
  historyStatsRow: {
    flexDirection: row,
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  historyStatMuted: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    ...rtlText,
  },
  historyStatDash: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  historyUnset: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    ...rtlText,
  },
  historyUnmarkedPrompt: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.gold,
    marginTop: 8,
    ...rtlText,
  },

  legendItem: { flexDirection: row, alignItems: "center", gap: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendLabel: { fontSize: 11, color: colors.muted, ...rtlText },
});
