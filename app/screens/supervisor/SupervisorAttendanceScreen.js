import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useApp } from "../../context/AppContext";
import { colors, radii } from "../../constants/theme";
import { row, fonts } from "../../constants/rtl";
import { ATTENDANCE_STATUS } from "../../constants/roles";
import { SoftButton, EmptyState, QuickButton } from "../../components/ui";
import { AttendanceRow } from "./components/SupervisorWidgets";
import { todayIso, buildDateChips, initials } from "./supervisorHelpers";

export default function SupervisorAttendanceScreen({
  myGroups,
  activeGroup,
  selectedGroupId,
  onSelectGroup,
}) {
  const { getUserById, attendance, saveAttendance } = useApp();

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [records, setRecords] = useState({});
  const dateChips = useMemo(buildDateChips, []);

  useEffect(() => {
    if (!activeGroup) return;
    const init = {};
    const found = attendance.find(
      (a) => a.groupId === activeGroup.id && a.date === selectedDate
    );
    (activeGroup.memberIds || []).forEach((id) => {
      init[id] = found?.records?.[id] === ATTENDANCE_STATUS.PRESENT;
    });
    setRecords(init);
  }, [activeGroup, selectedDate, attendance]);

  const handleSaveAttendance = () => {
    if (!activeGroup) {
      Alert.alert("تنبيه", "لا توجد مجموعة مسندة إليك");
      return;
    }
    const mapped = {};
    Object.entries(records).forEach(([mid, present]) => {
      mapped[mid] = present ? ATTENDANCE_STATUS.PRESENT : ATTENDANCE_STATUS.ABSENT;
    });
    saveAttendance(activeGroup.id, selectedDate, mapped);
    Alert.alert("تم", "تم حفظ الحضور");
  };

  return (
    <View style={styles.flexFill}>
      {myGroups.length > 1 ? (
        <View style={styles.groupPicker}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {myGroups.map((g) => (
              <SoftButton
                key={g.id}
                label={g.name}
                active={selectedGroupId === g.id}
                onPress={() => onSelectGroup(g.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.dateChipsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {dateChips.map((d) => {
            const active = d.iso === selectedDate;
            return (
              <TouchableOpacity
                key={d.iso}
                style={[styles.dateChip, active && styles.dateChipActive]}
                onPress={() => setSelectedDate(d.iso)}
                activeOpacity={0.8}
              >
                <Text style={[styles.dateChipDay, active && styles.dateChipTextActive]}>
                  {d.day}
                </Text>
                <Text style={[styles.dateChipNum, active && styles.dateChipTextActive]}>
                  {d.num}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {activeGroup ? (
        <View style={styles.sessionBanner}>
          <Text style={styles.sessionBannerText}>
            {activeGroup.name}
            {activeGroup.schedule ? ` - ${activeGroup.schedule}` : ""}
          </Text>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {!activeGroup || (activeGroup.memberIds || []).length === 0 ? (
          <EmptyState text="لا يوجد أعضاء في هذه المجموعة" />
        ) : (
          activeGroup.memberIds.map((mid) => {
            const user = getUserById(mid);
            if (!user) return null;
            const name = `${user.firstName} ${user.lastName}`;
            return (
              <AttendanceRow
                key={mid}
                name={name}
                initial={initials(user.firstName)}
                value={!!records[mid]}
                onToggle={(v) => setRecords((prev) => ({ ...prev, [mid]: v }))}
              />
            );
          })
        )}
      </ScrollView>

      <View style={styles.saveBar}>
        <QuickButton
          label="حفظ الحضور "
          icon="checkmark"
          color={colors.primary}
          onPress={handleSaveAttendance}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  groupPicker: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.card },
  dateChipsWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateChip: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    marginEnd: 8,
    minWidth: 56,
  },
  dateChipActive: { backgroundColor: colors.primary },
  dateChipDay: { fontSize: 11, color: colors.muted, fontFamily: fonts.regular },
  dateChipNum: { fontSize: 15, color: colors.text, fontFamily: fonts.bold, marginTop: 2 },
  dateChipTextActive: { color: "white" },
  sessionBanner: { padding: 10, backgroundColor: colors.primarySoft },
  sessionBannerText: { color: colors.primary, fontFamily: fonts.semiBold, textAlign: "center" },
  saveBar: { padding: 16, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
});
