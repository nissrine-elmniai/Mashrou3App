import React, { useState } from "react";
import { Text, StyleSheet, Alert } from "react-native";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  FormInput,
  StatCard,
  EmptyState,
} from "../../components/ui";
import { colors } from "../../constants/theme";

export default function SupervisorExamsScreen({ navigation }) {
  const {
    currentUser,
    getSupervisorGroups,
    getUserById,
    exams,
    addExamResult,
  } = useApp();

  const myGroups = getSupervisorGroups(currentUser?.id);
  const [forms, setForms] = useState({});

  const members = [];
  myGroups.forEach((g) => {
    g.memberIds.forEach((mid) => {
      const user = getUserById(mid);
      if (user) members.push({ user, group: g });
    });
  });

  const setField = (key, field, value) => {
    setForms((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [field]: value },
    }));
  };

  const submit = (memberId, group) => {
    const key = `${group.id}_${memberId}`;
    const form = forms[key] || {};
    if (!form.score || !form.level) {
      Alert.alert("تنبيه", "أدخل الدرجة والمستوى");
      return;
    }
    addExamResult({
      memberId,
      groupId: group.id,
      seasonId: group.seasonId,
      score: form.score,
      level: form.level,
      notes: form.notes || "",
    });
    Alert.alert("تم", "تم تسجيل نتيجة الاختبار");
    setForms((prev) => ({ ...prev, [key]: {} }));
  };

  const myExamIds = new Set();
  myGroups.forEach((g) => g.memberIds.forEach((id) => myExamIds.add(id)));
  const myExams = exams.filter((e) => myExamIds.has(e.memberId));

  return (
    <AppShell
      title="إدارة الاختبارات"
      subtitle="تسجيل درجات نهاية الموسم"
      icon="school"
      onBack={() => navigation.goBack()}
    >
      <SectionCard title="إدخال نتيجة" subtitle="اختر عضواً وسجّل درجته">
        {members.length === 0 ? (
          <EmptyState text="لا يوجد أعضاء" />
        ) : (
          members.map(({ user, group }) => {
            const key = `${group.id}_${user.id}`;
            const form = forms[key] || {};
            return (
              <SectionCard
                key={key}
                title={`${user.firstName} ${user.lastName}`}
                subtitle={group.name}
                borderColor={colors.border}
              >
                <FormInput
                  placeholder="الدرجة (مثلاً 18)"
                  value={form.score || ""}
                  onChangeText={(v) => setField(key, "score", v)}
                  keyboardType="numeric"
                />
                <FormInput
                  placeholder="المستوى (مثلاً جزء عم)"
                  value={form.level || ""}
                  onChangeText={(v) => setField(key, "level", v)}
                />
                <FormInput
                  placeholder="ملاحظات"
                  value={form.notes || ""}
                  onChangeText={(v) => setField(key, "notes", v)}
                />
                <QuickButton
                  color={colors.primary}
                  icon="save-outline"
                  label="تسجيل النتيجة"
                  onPress={() => submit(user.id, group)}
                />
              </SectionCard>
            );
          })
        )}
      </SectionCard>

      <SectionCard title="النتائج المسجّلة" subtitle="اختبارات مجموعاتك">
        {myExams.length === 0 ? (
          <EmptyState text="لا توجد نتائج بعد" />
        ) : (
          myExams.map((e) => {
            const user = getUserById(e.memberId);
            return (
              <StatCard
                key={e.id}
                icon="school-outline"
                iconColor={colors.gold}
                borderColor={colors.borderGold}
                label={
                  user
                    ? `${user.firstName} ${user.lastName} • ${e.level}`
                    : e.level
                }
                value={e.score}
                valueColor={colors.gold}
              />
            );
          })
        )}
      </SectionCard>
    </AppShell>
  );
}
