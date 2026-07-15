import React, { useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  FormInput,
  EmptyState,
  SoftButton,
  PersonCard,
} from "../../components/ui";
import { ROLES, ROLE_LABELS } from "../../constants/roles";
import { colors } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";
export default function AdminSupervisorsScreen({ navigation }) {
  const {
    users,
    groups,
    seasons,
    addSupervisor,
    getSupervisorGroups,
  } = useApp();
  const supervisors = users.filter((u) => u.role === ROLES.SUPERVISOR);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456");
  const [mode, setMode] = useState("existing");
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [newGroupName, setNewGroupName] = useState("");
  const [seasonId, setSeasonId] = useState(
    seasons.find((s) => s.active)?.id || seasons[0]?.id || ""
  );

  const handleAdd = () => {
    const payload = { firstName, lastName, email, password };
    if (mode === "existing") {
      if (!groupId) {
        Alert.alert("تنبيه", "اختر المجموعة المعنية بهذا المشرف");
        return;
      }
      payload.groupId = groupId;
    } else {
      if (!newGroupName.trim() || !seasonId) {
        Alert.alert("تنبيه", "أدخل اسم المجموعة واختر الموسم");
        return;
      }
      payload.newGroup = {
        name: newGroupName.trim(),
        seasonId,
        freeTimeSlot: "",
        schedule: "",
      };
    }
    const result = addSupervisor(payload);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    Alert.alert(
      "تم",
      `تمت إضافة المشرف وربطه بالمجموعة: ${result.group?.name || "—"}`
    );
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("123456");
    setNewGroupName("");
  };

  return (
    <AppShell
      title="إدارة المشرفين"
      subtitle="إضافة مشرف مع تحديد المجموعة المعنية"
      icon="shield-checkmark"
      onBack={() => navigation.goBack()}
    >
      <SectionCard
        title="إضافة مشرف"
        subtitle="الحساب + المجموعة المسندة إليه"
      >
        <FormInput
          placeholder="الاسم"
          value={firstName}
          onChangeText={setFirstName}
        />
        <FormInput
          placeholder="اللقب"
          value={lastName}
          onChangeText={setLastName}
        />
        <FormInput
          placeholder="البريد الإلكتروني"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <FormInput
          placeholder="كلمة المرور"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text style={styles.label}>المجموعة المعنية بالمشرف</Text>
        <SoftButton
          label="مجموعة موجودة"
          active={mode === "existing"}
          onPress={() => setMode("existing")}
        />
        <SoftButton
          label="إنشاء مجموعة جديدة"
          active={mode === "new"}
          onPress={() => setMode("new")}
        />

        {mode === "existing"
          ? groups.map((g) => (
              <SoftButton
                key={g.id}
                active={groupId === g.id}
                label={g.name}
                onPress={() => setGroupId(g.id)}
              />
            ))
          : (
            <View>
              <Text style={styles.label}>اسم مجموعة المشرف</Text>
              <FormInput
                placeholder="أدخل اسم المجموعة كما سيديرها المشرف"
                value={newGroupName}
                onChangeText={setNewGroupName}
              />
              <Text style={styles.label}>الموسم</Text>
              {seasons.map((s) => (
                <SoftButton
                  key={s.id}
                  active={seasonId === s.id}
                  label={s.name}
                  onPress={() => setSeasonId(s.id)}
                />
              ))}
            </View>
          )}

        <QuickButton
          color={colors.primary}
          icon="person-add-outline"
          label="إضافة المشرف وربطه بالمجموعة"
          onPress={handleAdd}
        />
      </SectionCard>

      <Text style={styles.section}>المشرفون الحاليون</Text>
      {supervisors.length === 0 ? (
        <EmptyState text="لا يوجد مشرفون بعد" />
      ) : (
        supervisors.map((s) => {
          const myGroups = getSupervisorGroups(s.id);
          return (
            <PersonCard
              key={s.id}
              initials={`${s.firstName?.[0] || ""}${s.lastName?.[0] || ""}`}
              name={`${s.firstName} ${s.lastName}`}
              meta={[
                s.email,
                `المجموعات: ${myGroups.map((g) => g.name).join("، ") || "—"}`,
              ]}
              pill={ROLE_LABELS.supervisor}
            />
          );
        })
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  label: { ...rtlText, color: colors.muted, marginTop: 8, marginBottom: 6 },
  section: {
    fontSize: 17,
    fontWeight: "bold",
    ...rtlText,
    marginVertical: 10,
    color: colors.text,
  },
});
