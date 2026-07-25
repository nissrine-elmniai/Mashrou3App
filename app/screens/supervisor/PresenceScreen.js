import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  StatCard,
  SoftButton,
} from "../../components/ui";
import { ATTENDANCE_STATUS } from "../../constants/roles";
import { colors } from "../../constants/theme";
import { rtlText, row } from "../../constants/rtl";

export default function PresenceScreen({ navigation }) {
  const {
    currentUser,
    getSupervisorGroups,
    getUserById,
    attendance,
    saveAttendance,
  } = useApp();

  const myGroups = getSupervisorGroups(currentUser?.id);
  const [groupId, setGroupId] = useState(myGroups[0]?.id || "");
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  const [date] = useState(today);

  const group = myGroups.find((g) => g.id === groupId);
  const existing = attendance.find(
    (a) => a.groupId === groupId && a.date === date
  );

  const [records, setRecords] = useState(() => {
    const init = {};
    (group?.memberIds || []).forEach((id) => {
      init[id] = existing?.records?.[id] || ATTENDANCE_STATUS.UNSET;
    });
    return init;
  });

  useEffect(() => {
    const init = {};
    (group?.memberIds || []).forEach((id) => {
      const found = attendance.find(
        (a) => a.groupId === groupId && a.date === date
      );
      init[id] = found?.records?.[id] || ATTENDANCE_STATUS.UNSET;
    });
    setRecords(init);
  }, [groupId, group, attendance, date]);

  const counts = useMemo(() => {
    const values = Object.values(records);
    return {
      present: values.filter((v) => v === ATTENDANCE_STATUS.PRESENT).length,
      absent: values.filter((v) => v === ATTENDANCE_STATUS.ABSENT).length,
      unset: values.filter((v) => v === ATTENDANCE_STATUS.UNSET).length,
    };
  }, [records]);

  const setStatus = (memberId, status) => {
    setRecords((prev) => ({ ...prev, [memberId]: status }));
  };

  const handleSave = () => {
    if (!groupId) {
      Alert.alert("تنبيه", "اختر مجموعة");
      return;
    }
    saveAttendance(groupId, date, records);
    Alert.alert("تم", "تم حفظ الحضور");
  };

  return (
    <AppShell
      title="إدارة الحضور"
      subtitle="تسجيل حضور وغياب الأعضاء"
      icon="calendar"
      onBack={() => navigation.goBack()}
    >
      <SectionCard title="اختر المجموعة" subtitle="المجموعات المسندة إليك">
        {myGroups.map((g) => (
          <SoftButton
            key={g.id}
            label={g.name}
            active={groupId === g.id}
            onPress={() => setGroupId(g.id)}
          />
        ))}
      </SectionCard>

      <StatCard
        icon="today-outline"
        iconColor={colors.primary}
        borderColor={colors.borderBlue}
        label="التاريخ"
        value={date}
        valueColor={colors.primary}
      />
      <StatCard
        icon="checkmark-circle-outline"
        iconColor={colors.green}
        borderColor={colors.borderGreen}
        label="حاضر"
        value={counts.present}
        valueColor={colors.green}
      />
      <StatCard
        icon="close-circle-outline"
        iconColor={colors.red}
        borderColor="#FECACA"
        label="غائب"
        value={counts.absent}
        valueColor={colors.red}
      />
      <StatCard
        icon="help-circle-outline"
        iconColor={colors.muted}
        borderColor={colors.border}
        label="غير محدد"
        value={counts.unset}
        valueColor={colors.text}
      />

      <SectionCard title="أعضاء المجموعة" subtitle="حدد حالة كل عضو">
        {(group?.memberIds || []).map((mid) => {
          const user = getUserById(mid);
          const status = records[mid];
          return (
            <View key={mid} style={styles.memberRow}>
              <Text style={styles.memberName}>
                {user ? `${user.firstName} ${user.lastName}` : mid}
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[
                    styles.statusBtn,
                    status === ATTENDANCE_STATUS.PRESENT && styles.present,
                  ]}
                  onPress={() => setStatus(mid, ATTENDANCE_STATUS.PRESENT)}
                >
                  <Text style={styles.statusText}>حاضر</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.statusBtn,
                    status === ATTENDANCE_STATUS.ABSENT && styles.absent,
                  ]}
                  onPress={() => setStatus(mid, ATTENDANCE_STATUS.ABSENT)}
                >
                  <Text style={styles.statusText}>غائب</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </SectionCard>

      <QuickButton
        label="حفظ الحضور"
        icon="checkmark"
        color={colors.primary}
        onPress={handleSave}
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  memberRow: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberName: { ...rtlText, fontWeight: "bold", marginBottom: 8 },
  btnRow: { flexDirection: row, gap: 8 },
  statusBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
  },
  present: { backgroundColor: "#86EFAC" },
  absent: { backgroundColor: "#FCA5A5" },
  statusText: { fontWeight: "600", ...rtlText },
});
