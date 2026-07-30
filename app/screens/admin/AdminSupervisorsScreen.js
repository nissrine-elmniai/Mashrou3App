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
import { ACCOUNT_STATUS, ROLES, ROLE_LABELS } from "../../constants/roles";
import { colors } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";

import { APP_EMAIL } from "../../constants/email";
import { sendSupervisorInviteEmail } from "../../utils/sendInviteEmail";

export default function AdminSupervisorsScreen({ navigation }) {
  const { users, addSupervisor, getSupervisorGroups } = useApp();
  const supervisors = users.filter((u) => u.role === ROLES.SUPERVISOR);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [groupName, setGroupName] = useState("");
  const [sending, setSending] = useState(false);

  const handleAdd = async () => {
    if (!groupName.trim()) {
      Alert.alert("تنبيه", "أدخل اسم المجموعة المعنية بالمشرف");
      return;
    }
    setSending(true);
    const result = addSupervisor({
      firstName,
      lastName,
      email,
      groupName: groupName.trim(),
    });
    if (!result.ok) {
      setSending(false);
      Alert.alert("خطأ", result.error);
      return;
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const mail = await sendSupervisorInviteEmail({
      toEmail: email.trim(),
      fullName,
      groupName: result.groupName,
    });
    setSending(false);

    if (mail.ok) {
      Alert.alert(
        "تمت الإضافة",
        `تمت إضافة ${fullName} وإرسال الرسالة إلى:\n${email.trim()}`
      );
    } else {
      Alert.alert(
        "تمت الإضافة — فشل إرسال البريد",
        `${mail.error || ""}\n\nتمت إضافة المشرف. أبلغه أنه يمكنه إنشاء حسابه من التطبيق.`
      );
    }

    setFirstName("");
    setLastName("");
    setEmail("");
    setGroupName("");
  };

  return (
    <AppShell
      title="إدارة المشرفين"
      subtitle="إضافة مشرف بالاسم والبريد والمجموعة — ثم إرسال رسالة تلقائية"
      icon="shield-checkmark"
      onBack={() => navigation.goBack()}
    >
      <SectionCard
        title="إضافة مشرف"
        subtitle="الاسم، البريد الإلكتروني، والمجموعة المكلف بها"
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

        <Text style={styles.label}>اسم المجموعة</Text>
        <FormInput
          placeholder="مثال: مجموعة الفجر"
          value={groupName}
          onChangeText={setGroupName}
        />
        <Text style={styles.hint}>
          تُحاكى رسالة من بريد التطبيق ({APP_EMAIL.fromEmail}) — بدون إرسال
          حقيقي حالياً. لاحقاً تُربط بالخادم.
        </Text>

        <QuickButton
          color={colors.primary}
          icon="mail-outline"
          label={sending ? "جاري الإرسال..." : "إضافة وإرسال الرسالة"}
          onPress={sending ? undefined : handleAdd}
        />
      </SectionCard>

      <Text style={styles.section}>المشرفون الحاليون</Text>
      {supervisors.length === 0 ? (
        <EmptyState text="لا يوجد مشرفون بعد" />
      ) : (
        supervisors.map((s) => {
          const myGroups = getSupervisorGroups(s.id);
          const pending = s.accountStatus === ACCOUNT_STATUS.INVITED;
          return (
            <PersonCard
              key={s.id}
              initials={`${s.firstName?.[0] || ""}${s.lastName?.[0] || ""}`}
              name={`${s.firstName} ${s.lastName}`}
              meta={[
                s.email,
                `المجموعات: ${myGroups.map((g) => g.name).join("، ") || "—"}`,
                pending ? "بانتظار إنشاء الحساب" : "مفعّل",
              ]}
              pill={pending ? "بانتظار التفعيل" : ROLE_LABELS.supervisor}
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
  picker: { width: "100%", marginBottom: 8 },
  section: {
    fontSize: 17,
    fontWeight: "bold",
    ...rtlText,
    marginVertical: 10,
    color: colors.text,
  },
});
