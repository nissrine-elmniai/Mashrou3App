import React, { useMemo, useState } from "react";
import { Text, StyleSheet, Alert } from "react-native";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  FormInput,
  EmptyState,
  SoftButton,
} from "../../components/ui";
import { REGISTRATION_STATUS, SEASON_TYPES } from "../../constants/roles";
import { colors } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";

export default function AdminGroupsScreen({ navigation, route }) {
  const seasonType = route?.params?.seasonType || SEASON_TYPES.REGULAR;
  const isSummer = seasonType === SEASON_TYPES.SUMMER;

  const {
    seasons,
    groups,
    registrations,
    createGroup,
    assignMemberToGroup,
    getSupervisors,
    getUserById,
  } = useApp();

  const typedSeasons = seasons.filter((s) => s.type === seasonType);
  const activeSeason =
    typedSeasons.find((s) => s.active) || typedSeasons[0];
  const supervisors = getSupervisors();

  const [name, setName] = useState("");
  const [supervisorId, setSupervisorId] = useState(supervisors[0]?.id || "");
  const [schedule, setSchedule] = useState("");

  const seasonGroups = useMemo(
    () => groups.filter((g) => g.seasonId === activeSeason?.id),
    [groups, activeSeason]
  );

  const acceptedUnassigned = useMemo(() => {
    if (!activeSeason) return [];
    return registrations
      .filter(
        (r) =>
          r.seasonId === activeSeason.id &&
          r.status === REGISTRATION_STATUS.ACCEPTED
      )
      .filter(
        (r) =>
          !groups.some(
            (g) =>
              g.seasonId === activeSeason.id && g.memberIds.includes(r.userId)
          )
      );
  }, [registrations, groups, activeSeason]);

  const handleCreate = () => {
    if (!activeSeason) {
      Alert.alert(
        "تنبيه",
        isSummer ? "لا توجد مدرسة صيفية" : "لا يوجد موسم عادي"
      );
      return;
    }
    if (!name.trim() || !supervisorId) {
      Alert.alert("تنبيه", "أدخل اسم المجموعة واختر المشرف");
      return;
    }
    createGroup({
      seasonId: activeSeason.id,
      name: name.trim(),
      freeTimeSlot: "",
      supervisorId,
      schedule: schedule.trim(),
      remote: isSummer || !!activeSeason.remote,
    });
    setName("");
    setSchedule("");
    Alert.alert("تم", "تم إنشاء المجموعة");
  };

  const accent = isSummer ? colors.orange : colors.primary;

  return (
    <AppShell
      title={isSummer ? "مجموعات المدرسة الصيفية" : "مجموعات الموسم العادي"}
      subtitle={
        (activeSeason?.name || "—") +
        (isSummer ? " • عن بعد • منفصلة عن الموسم" : " • حضوري")
      }
      icon="people"
      onBack={() => navigation.goBack()}
    >
      <SectionCard
        title="إنشاء مجموعة"
        subtitle="أدخل اسم مجموعة المشرف ثم اختر المسؤول"
        primary={accent}
        borderColor={isSummer ? "#FDE68A" : colors.borderBlue}
      >
        <FormInput
          placeholder="اسم مجموعة المشرف"
          value={name}
          onChangeText={setName}
        />
        <Text style={styles.label}>المشرف المسؤول عن المجموعة</Text>
        {supervisors.length === 0 ? (
          <EmptyState text="أضف مشرفاً أولاً ثم أنشئ مجموعته" />
        ) : (
          supervisors.map((s) => (
            <SoftButton
              key={s.id}
              label={`${s.firstName} ${s.lastName}`}
              active={supervisorId === s.id}
              onPress={() => setSupervisorId(s.id)}
            />
          ))
        )}
        <FormInput
          placeholder={
            isSummer
              ? "مواعيد اللقاءات عن بعد (اختياري)"
              : "مواعيد الحلقات (اختياري)"
          }
          value={schedule}
          onChangeText={setSchedule}
        />
        <QuickButton
          label="إنشاء المجموعة"
          color={accent}
          icon="add"
          onPress={handleCreate}
        />
      </SectionCard>

      <Text style={styles.listTitle}>المجموعات</Text>
      {seasonGroups.length === 0 ? (
        <EmptyState text="لا توجد مجموعات بعد" />
      ) : (
        seasonGroups.map((g) => {
          const supervisor = getUserById(g.supervisorId);
          return (
            <SectionCard
              key={g.id}
              title={g.name}
              primary={accent}
              borderColor={isSummer ? "#FDE68A" : colors.borderBlue}
            >
              {g.schedule ? (
                <Text style={styles.meta}>الموعد: {g.schedule}</Text>
              ) : null}
              {g.remote ? (
                <Text style={styles.meta}>نوع اللقاء: عن بعد</Text>
              ) : null}
              <Text style={styles.meta}>
                المسؤول:{" "}
                {supervisor
                  ? `${supervisor.firstName} ${supervisor.lastName}`
                  : "—"}
              </Text>
              <Text style={styles.meta}>الأعضاء: {g.memberIds.length}</Text>
              {g.memberIds.map((mid) => {
                const m = getUserById(mid);
                return (
                  <Text key={mid} style={styles.member}>
                    • {m ? `${m.firstName} ${m.lastName}` : mid}
                  </Text>
                );
              })}
            </SectionCard>
          );
        })
      )}

      <Text style={styles.listTitle}>مقبولون بدون مجموعة</Text>
      {acceptedUnassigned.length === 0 ? (
        <EmptyState text="الكل موزّعون على مجموعات" />
      ) : (
        acceptedUnassigned.map((reg) => {
          const user = getUserById(reg.userId);
          return (
            <SectionCard
              key={reg.id}
              title={user ? `${user.firstName} ${user.lastName}` : "عضو"}
            >
              <Text style={styles.meta}>
                {(reg.freeTimes || []).join("، ")}
              </Text>
              {seasonGroups.map((g) => (
                <QuickButton
                  key={g.id}
                  label={`إضافة إلى ${g.name}`}
                  color={colors.primary}
                  onPress={() => {
                    assignMemberToGroup(g.id, reg.userId);
                    Alert.alert("تم", "تمت إضافة العضو للمجموعة");
                  }}
                />
              ))}
            </SectionCard>
          );
        })
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  label: { ...rtlText, color: colors.muted, marginBottom: 6, marginTop: 4 },
  listTitle: {
    fontSize: 17,
    fontWeight: "bold",
    ...rtlText,
    color: colors.text,
    marginBottom: 12,
    marginTop: 4,
  },
  meta: { ...rtlText, color: colors.muted, marginTop: 4 },
  member: { ...rtlText, marginTop: 4, color: colors.text },
});
