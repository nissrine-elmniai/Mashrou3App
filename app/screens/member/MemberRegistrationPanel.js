import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
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
import { fetchMySeasonRegistrationView } from "../../lib/memberApplicationsApi";
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
    if (seancesReason === "invalid_genre" || !gender) {
      return "حدّث الجنس في ملفك الشخصي لعرض الحصص المتاحة";
    }
    if (gender === "أنثى") return "لا توجد حصص للإناث في هذا الموسم بعد";
    if (gender === "ذكر") return "لا توجد حصص للذكور في هذا الموسم بعد";
    return "حدّث الجنس في ملفك الشخصي لعرض الحصص المتاحة";
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

function SeasonStatus({ state }) {
  if (state?.mode === "review") {
    return <Text style={styles.statusText}>طلبك قيد المراجعة</Text>;
  }
  if (state?.mode === "accepted") {
    return (
      <Text style={styles.statusText}>
        {state.seanceName
          ? `تم قبول تسجيلك\n${state.seanceName}`
          : "تم قبول تسجيلك"}
      </Text>
    );
  }
  if (state?.mode === "waiting") {
    return (
      <Text style={styles.statusText}>
        تم قبول تسجيلك — في انتظار تعيين حصة جديدة
      </Text>
    );
  }
  return null;
}

export default function MemberRegistrationPanel({
  openRegular,
  openSummer,
  gender,
  onSubmit,
  userId,
}) {
  const [bySeason, setBySeason] = useState({});
  const [loadingView, setLoadingView] = useState(false);
  const [viewError, setViewError] = useState(null);
  const seasonKey = [...openRegular, ...openSummer].map((season) => season.id).join("|");

  const loadView = useCallback(async () => {
    const ids = seasonKey ? seasonKey.split("|") : [];
    if (!userId || ids.length === 0) {
      setBySeason({});
      setViewError(null);
      return;
    }
    setLoadingView(true);
    const res = await fetchMySeasonRegistrationView(userId, ids);
    setLoadingView(false);
    if (!res.ok) {
      setViewError(res.error || "تعذر تحميل حالة التسجيل");
      return;
    }
    setViewError(null);
    setBySeason(res.bySeason || {});
  }, [seasonKey, userId]);

  useFocusEffect(
    useCallback(() => {
      loadView();
    }, [loadView])
  );

  const handleSubmit = async (payload) => {
    const result = await onSubmit(payload);
    if (result?.ok) await loadView();
    return result;
  };

  const renderSeasons = (seasons, buttonColor) => {
    if (loadingView) {
      return <ActivityIndicator color={buttonColor} style={{ marginVertical: 12 }} />;
    }
    return seasons.map((season) => {
      const state = bySeason[String(season.id)];
      if (
        state?.mode === "review" ||
        state?.mode === "accepted" ||
        state?.mode === "waiting"
      ) {
        return <SeasonStatus key={season.id} state={state} />;
      }
      return (
        <View key={season.id}>
          {state?.rejected ? (
            <Text style={styles.statusText}>
              لم يتم قبول طلبك السابق، يمكنك إعادة التقديم
            </Text>
          ) : null}
          {viewError ? <Text style={styles.hint}>{viewError}</Text> : null}
          <RegistrationBlock
            seasons={[season]}
            gender={gender}
            buttonLabel="إرسال استمارة التسجيل"
            buttonColor={buttonColor}
            onSubmit={handleSubmit}
          />
        </View>
      );
    });
  };

  // Inscription été ouverte sans saison regular : ne pas dire que le registre est fermé.
  const summerOnly = openRegular.length === 0 && openSummer.length > 0;
  return (
    <View>
      <SectionCard
        title="التسجيل في الموسم"
        subtitle={
          openRegular.length > 0
            ? `الموسم النشط: ${openRegular[0].name}`
            : summerOnly
              ? "لا يوجد موسم عادي مفتوح"
              : "مرتبط بانطلاق موسم جديد من الإدارة"
        }
      >
        {openRegular.length === 0 ? (
          <EmptyState
            text={
              summerOnly
                ? "التسجيل متاح في المدرسة الصيفية أدناه"
                : "باب التسجيل مغلق — يُفتح تلقائياً عند انطلاق موسم جديد من المشرف العام"
            }
          />
        ) : (
          renderSeasons(openRegular, colors.primary)
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
          renderSeasons(openSummer, colors.orange)
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
  statusText: {
    ...rtlText,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 12,
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
