import React, { useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { useApp } from "../../context/AppContext";
import {
  AppShell,
  SectionCard,
  QuickButton,
  FormInput,
  EmptyState,
} from "../../components/ui";
import { colors } from "../../constants/theme";
import { rtlText } from "../../constants/rtl";

export default function SupervisorTrackingScreen({ navigation }) {
  const {
    currentUser,
    getSupervisorGroups,
    getUserById,
    getMemberProgress,
    updateMemberProgress,
    addProgressNote,
  } = useApp();

  const myGroups = getSupervisorGroups(currentUser?.id);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [amounts, setAmounts] = useState({});

  const rows = [];
  myGroups.forEach((g) => {
    g.memberIds.forEach((mid) => {
      const prog = getMemberProgress(mid, g.seasonId);
      const user = getUserById(mid);
      if (prog && user) rows.push({ prog, user, group: g });
    });
  });

  const setAmount = (progressId, field, value) => {
    setAmounts((prev) => ({
      ...prev,
      [progressId]: {
        ...(prev[progressId] || {}),
        [field]: value,
      },
    }));
  };

  const addAmount = (progressId, field) => {
    const row = rows.find((r) => r.prog.id === progressId);
    if (!row) return;
    const raw = amounts[progressId]?.[field] ?? "";
    const qty = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert("تنبيه", "أدخل مقداراً صحيحاً أكبر من صفر");
      return;
    }
    const next = Math.max(0, (row.prog[field] || 0) + qty);
    updateMemberProgress(progressId, { [field]: next });
    setAmounts((prev) => ({
      ...prev,
      [progressId]: {
        ...(prev[progressId] || {}),
        [field]: "",
      },
    }));
    Alert.alert("تم", `تمت إضافة ${qty} صفحة`);
  };

  const saveEval = (progressId, value) => {
    updateMemberProgress(progressId, { lastEvaluation: value });
    Alert.alert("تم", "تم تحديث التقييم");
  };

  const saveNote = (progressId) => {
    const note = (noteDrafts[progressId] || "").trim();
    if (!note) return;
    addProgressNote(progressId, note);
    setNoteDrafts((prev) => ({ ...prev, [progressId]: "" }));
    Alert.alert("تم", "تمت إضافة الملاحظة");
  };

  return (
    <AppShell
      title="متابعة الحفظ والمراجعة"
      subtitle="تسجيل المقدار المحفوظ والمراجَع"
      icon="book"
      onBack={() => navigation.goBack()}
    >
      {rows.length === 0 ? (
        <EmptyState text="لا يوجد أعضاء في مجموعاتك" />
      ) : (
        rows.map(({ prog, user, group }) => {
          const pct = Math.min(
            100,
            Math.round(
              ((prog.hifzPages || 0) / (prog.targetPages || 1)) * 100
            )
          );
          const draft = amounts[prog.id] || {};
          return (
            <SectionCard
              key={prog.id}
              title={`${user.firstName} ${user.lastName}`}
              subtitle={`${group.name} • التقدم ${pct}%`}
            >
              <Text style={styles.meta}>
                المجموع الحالي — حفظ: {prog.hifzPages || 0} صفحة • مراجعة:{" "}
                {prog.reviewPages || 0}
              </Text>

              <Text style={styles.fieldLabel}>مقدار الحفظ اليوم (صفحات)</Text>
              <FormInput
                placeholder="مثال: 2 أو 0.5"
                value={draft.hifzPages || ""}
                onChangeText={(v) => setAmount(prog.id, "hifzPages", v)}
                keyboardType="decimal-pad"
              />
              <QuickButton
                color={colors.green}
                icon="add-circle-outline"
                label="إضافة مقدار الحفظ"
                onPress={() => addAmount(prog.id, "hifzPages")}
              />

              <Text style={styles.fieldLabel}>مقدار المراجعة اليوم (صفحات)</Text>
              <FormInput
                placeholder="مثال: 5"
                value={draft.reviewPages || ""}
                onChangeText={(v) => setAmount(prog.id, "reviewPages", v)}
                keyboardType="decimal-pad"
              />
              <QuickButton
                color={colors.primary}
                icon="add-circle-outline"
                label="إضافة مقدار المراجعة"
                onPress={() => addAmount(prog.id, "reviewPages")}
              />

              <FormInput
                placeholder="التقييم الأخير"
                value={String(prog.lastEvaluation || "")}
                onChangeText={(v) => saveEval(prog.id, v)}
              />
              <FormInput
                placeholder="ملاحظة جديدة..."
                value={noteDrafts[prog.id] || ""}
                onChangeText={(v) =>
                  setNoteDrafts((prev) => ({ ...prev, [prog.id]: v }))
                }
              />
              <QuickButton
                color={colors.orange}
                icon="create-outline"
                label="حفظ الملاحظة"
                onPress={() => saveNote(prog.id)}
              />
            </SectionCard>
          );
        })
      )}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  meta: { ...rtlText, color: colors.muted, marginBottom: 10 },
  fieldLabel: {
    ...rtlText,
    color: colors.textSecondary || colors.muted,
    fontWeight: "600",
    marginTop: 4,
    marginBottom: 6,
  },
});
