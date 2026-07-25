import React, { useState } from "react";
import { Text, StyleSheet, Alert } from "react-native";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  FormInput,
  EmptyState,
  PersonCard,
} from "../../components/ui";
import { ROLES, ROLE_LABELS } from "../../constants/roles";
import { colors } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";

export default function AdminSupervisorsScreen({ navigation }) {
  const { users, addSupervisor, getSupervisorGroups } = useApp();
  const supervisors = users.filter((u) => u.role === ROLES.SUPERVISOR);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456");
  const [groupName, setGroupName] = useState("");

  const handleAdd = () => {
    if (!groupName.trim()) {
      Alert.alert("تنبيه", "أدخل اسم المجموعة المعنية بالمشرف");
      return;
    }
    const result = addSupervisor({
      firstName,
      lastName,
      email,
      password,
      groupName: groupName.trim(),
    });
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    Alert.alert(
      "تم",
      result.created
        ? `تم إنشاء المجموعة «${result.group?.name}» وربطها بالمشرف`
        : `تمت إضافة المشرف وربطه بالمجموعة: ${result.group?.name || "—"}`
    );
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("123456");
    setGroupName("");
  };

  return (
    <AppShell
      title="إدارة المشرفين"
      subtitle="إضافة مشرف مع اسم مجموعته"
      icon="shield-checkmark"
      onBack={() => navigation.goBack()}
    >
      <SectionCard
        title="إضافة مشرف"
        subtitle="اكتب اسم المجموعة — تُربط إن وُجدت أو تُنشأ تلقائياً"
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

        <Text style={styles.label}>اسم المجموعة</Text>
        <FormInput
          placeholder="مثال: مجموعة الفجر"
          value={groupName}
          onChangeText={setGroupName}
        />
        <Text style={styles.hint}>
          إذا كان الاسم موجوداً يُربط بالمشرف، وإلا تُنشأ مجموعة جديدة تلقائياً
        </Text>

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
  hint: {
    ...rtlText,
    color: colors.orange,
    marginBottom: 10,
    lineHeight: 20,
    fontSize: 13,
  },
  section: {
    fontSize: 17,
    fontWeight: "bold",
    ...rtlText,
    marginVertical: 10,
    color: colors.text,
  },
});
