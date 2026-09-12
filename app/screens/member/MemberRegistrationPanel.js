import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  getActiveSeancesByGenre,
  formatSeanceScheduleLabel,
} from "../../lib/seancesApi";
import { parseObjectifInput } from "../../lib/objectifsApi";
import { colors, radii } from "../../constants/theme";
import { rtlText, textAlignStart } from "../../constants/rtl";
import { SectionCard, QuickButton, EmptyState } from "../../components/ui";

const EMPTY_ANSWERS = {
  seasonGoal: "",
  difficulties: "",
  desiredActivities: "",
  seanceId: "",
};

function FieldLabel({ children, required }) {
  return (
    <Text style={styles.label}>
      {children}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

function SeanceChips({ seances, value, onChange }) {
  return (
    <View style={styles.chipColumn}>
      {seances.map((s) => {
        const active = value === s.id;
        return (
          <TouchableOpacity
            key={s.id}
            style={[styles.seanceChip, active && styles.seanceChipActive]}
            onPress={() => onChange(s.id)}
            activeOpacity={0.75}
          >
            <Text
              style={[styles.seanceChipText, active && styles.seanceChipTextActive]}
            >
              {formatSeanceScheduleLabel(s)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RegistrationBlock({
  seasons,
  gender,
  buttonLabel,
  buttonColor,
  onSubmit,
}) {
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const [availableSeances, setAvailableSeances] = useState([]);
  const [seancesReason, setSeancesReason] = useState(null);
  const [seancesLoading, setSeancesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const primarySeasonId = seasons[0]?.id || null;
  const seasonName = seasons[0]?.name || "";

  const setField = (key, value) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!gender || !primarySeasonId) {
      setAvailableSeances([]);
      setSeancesReason(!gender ? "invalid_genre" : "no_season");
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setSeancesLoading(true);
      const res = await getActiveSeancesByGenre(gender, primarySeasonId);
      if (!cancelled) {
        setAvailableSeances(res.ok ? res.seances || [] : []);
        setSeancesReason(res.ok ? res.reason || null : "error");
        setSeancesLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [gender, primarySeasonId]);

  const selectedSeance = useMemo(
    () => availableSeances.find((s) => s.id === answers.seanceId) || null,
    [availableSeances, answers.seanceId]
  );

  const emptySeancesMessage = (() => {
    if (seancesReason === "wrong_season") {
      return seasonName
        ? `لا توجد حصص نشطة لموسم «${seasonName}» حسب جنسك — أُرشفت حصص الموسم السابق عند الانطلاق. يضيفها المشرف العام من شاشة الحصص.`
        : "لا توجد حصص لهذا الموسم حسب جنسك — يضيفها المشرف العام من شاشة الحصص بعد انطلاق الموسم.";
    }
    if (seancesReason === "invalid_genre") {
      return "حدّث الجنس في ملفك الشخصي لعرض الحصص المتاحة";
    }
    return "لا توجد حصص نشطة حسب جنسك في هذا الموسم — يضيفها المشرف العام فقط من شاشة الحصص";
  })();

  const handleSubmit = async (seasonId) => {
    const parsedGoal = parseObjectifInput(answers.seasonGoal);
    if (!parsedGoal.ok) {
      Alert.alert("تنبيه", parsedGoal.error);
      return;
    }
    if (!answers.seanceId) {
      Alert.alert("تنبيه", "اختر الحصة المناسبة");
      return;
    }

    const seasonGoal = String(parsedGoal.value);
    setSubmitting(true);
    const result = await onSubmit({
      seasonId,
      seanceId: answers.seanceId,
      seanceName: selectedSeance
        ? formatSeanceScheduleLabel(selectedSeance)
        : "",
      hifzAmount: seasonGoal,
      formAnswers: {
        seasonGoal,
        difficulties: answers.difficulties.trim(),
        desiredActivities: answers.desiredActivities.trim(),
      },
    });
    setSubmitting(false);

    if (result?.ok) {
      setAnswers(EMPTY_ANSWERS);
    }
  };

  if (!gender) {
    return (
      <EmptyState text="حدّث الجنس في ملفك الشخصي لعرض الحصص المتاحة" />
    );
  }

  return (
    <View>
      <View style={styles.inputGroup}>
        <FieldLabel required>الحصة</FieldLabel>
        <Text style={styles.hint}>
          الحصص المعروضة حسب جنسك — يضيفها المشرف العام فقط
        </Text>
        {seancesLoading ? (
          <ActivityIndicator color={buttonColor} style={{ marginVertical: 12 }} />
        ) : availableSeances.length === 0 ? (
          <Text style={styles.hint}>{emptySeancesMessage}</Text>
        ) : (
          <SeanceChips
            seances={availableSeances}
            value={answers.seanceId}
            onChange={(v) => setField("seanceId", v)}
          />
        )}
      </View>

      <View style={styles.inputGroup}>
        <FieldLabel required>
          ما هو عدد الأحزاب الذي تطمح لحفظه من كتاب الله خلال هذا الموسم؟
        </FieldLabel>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="مثال: 5"
            placeholderTextColor={colors.placeholder}
            value={answers.seasonGoal}
            onChangeText={(v) => setField("seasonGoal", v)}
            keyboardType="number-pad"
            textAlign={textAlignStart}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <FieldLabel>
          ما أهم الصعوبات التي تجدها أثناء حفظ القرآن الكريم؟
        </FieldLabel>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="اختياري"
            placeholderTextColor={colors.placeholder}
            value={answers.difficulties}
            onChangeText={(v) => setField("difficulties", v)}
            multiline
            textAlign={textAlignStart}
            textAlignVertical="top"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <FieldLabel>
          ما هي البرامج أو الأنشطة التي تود أن تجدها في مشروع مهندس حامل لكتاب
          الله لتثري تجربتك؟
        </FieldLabel>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="اختياري"
            placeholderTextColor={colors.placeholder}
            value={answers.desiredActivities}
            onChangeText={(v) => setField("desiredActivities", v)}
            multiline
            textAlign={textAlignStart}
            textAlignVertical="top"
          />
        </View>
      </View>

      {seasons.map((s) => (
        <QuickButton
          key={s.id}
          color={buttonColor}
          label={
            submitting
              ? "جاري الإرسال..."
              : `${buttonLabel} — ${s.name}`
          }
          onPress={submitting ? undefined : () => handleSubmit(s.id)}
        />
      ))}
    </View>
  );
}

export default function MemberRegistrationPanel({
  openRegular,
  openSummer,
  gender,
  onSubmit,
}) {
  return (
    <View>
      <SectionCard
        title="التسجيل في الموسم"
        subtitle={
          openRegular.length > 0
            ? `الموسم النشط: ${openRegular[0].name}`
            : "مرتبط بانطلاق موسم جديد من الإدارة"
        }
      >
        {openRegular.length === 0 ? (
          <EmptyState text="باب التسجيل مغلق — يُفتح تلقائياً عند انطلاق موسم جديد من المشرف العام" />
        ) : (
          <RegistrationBlock
            seasons={openRegular}
            gender={gender}
            buttonLabel="إرسال استمارة الموسم"
            buttonColor={colors.primary}
            onSubmit={onSubmit}
          />
        )}
      </SectionCard>

      <SectionCard
        title="المدرسة الصيفية"
        subtitle="تسجيل منفصل عن الموسم العادي"
        borderColor="#FFE0B2"
        primary={colors.orange}
      >
        {openSummer.length === 0 ? (
          <EmptyState text="تسجيل المدرسة الصيفية مغلق حالياً" />
        ) : (
          <RegistrationBlock
            seasons={openSummer}
            gender={gender}
            buttonLabel="إرسال استمارة الصيف"
            buttonColor={colors.orange}
            onSubmit={onSubmit}
          />
        )}
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    ...rtlText,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  requiredMark: {
    color: colors.red,
  },
  hint: {
    ...rtlText,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
  input: {
    ...rtlText,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    minHeight: 48,
  },
  multiline: {
    minHeight: 88,
    paddingTop: 12,
  },
  chipColumn: {
    gap: 8,
  },
  seanceChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 12,
    backgroundColor: colors.bg,
  },
  seanceChipActive: {
    backgroundColor: colors.soft,
    borderColor: colors.primary,
  },
  seanceChipText: {
    ...rtlText,
    color: colors.muted,
    fontSize: 14,
  },
  seanceChipTextActive: {
    color: colors.primary,
    fontWeight: "700",
  },
});
