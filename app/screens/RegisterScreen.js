import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../context/AppContext";
import {
  GENDER_OPTIONS,
  REGISTRATION_STATUS,
  REGISTRATION_STATUS_LABELS,
} from "../constants/roles";
import {
  getActiveSeancesByGenre,
  formatSeanceScheduleLabel,
} from "../lib/seancesApi";
import { getActiveRegularSeason } from "../lib/seasonScope";
import { colors, radii, shadows } from "../constants/theme";
import { rtlText, row, textAlignStart } from "../constants/rtl";

const UNIVERSITY_OPTIONS = [
  { value: "طالب(ة)", label: "طالب(ة)" },
  { value: "خريج(ة)", label: "خريج(ة)" },
];

const YES_NO_OPTIONS = [
  { value: "نعم", label: "نعم" },
  { value: "لا", label: "لا" },
];

const EMPTY_FORM = {
  fullName: "",
  phone: "",
  email: "",
  gender: "",
  universityStatus: "",
  studentDetails: "",
  graduateSchool: "",
  hasExperience: "",
  hizbCount: "",
  seanceId: "",
  seasonGoal: "",
  difficulties: "",
  desiredActivities: "",
};

function ChipGroup({ options, value, onChange, columns = false }) {
  return (
    <View style={columns ? styles.chipColumn : styles.chipRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              columns ? styles.seanceChip : styles.chip,
              active && styles.chipActive,
            ]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FieldLabel({ children, required }) {
  return (
    <Text style={styles.label}>
      {children}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

export default function RegisterScreen({ navigation }) {
  const {
    seasons,
    registrations,
    submitMemberApplication,
    findRegistrationByPhone,
  } = useApp();

  const [form, setForm] = useState(EMPTY_FORM);
  const [availableSeances, setAvailableSeances] = useState([]);
  const [seancesLoading, setSeancesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);

  const submitted = useMemo(
    () => registrations.find((r) => r.id === submittedId) || null,
    [registrations, submittedId]
  );

  const setField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "gender" && value !== prev.gender) {
        next.seanceId = "";
      }
      if (key === "universityStatus") {
        if (value !== "طالب(ة)") next.studentDetails = "";
        if (value !== "خريج(ة)") next.graduateSchool = "";
      }
      if (key === "hasExperience" && value !== "نعم") {
        next.hizbCount = "";
      }
      return next;
    });
  };

  useEffect(() => {
    if (!form.gender) {
      setAvailableSeances([]);
      return undefined;
    }
    let cancelled = false;
    const activeSeason = getActiveRegularSeason(seasons);
    const load = async () => {
      setSeancesLoading(true);
      const res = await getActiveSeancesByGenre(
        form.gender,
        activeSeason?.id || null
      );
      if (!cancelled) {
        if (res.ok) setAvailableSeances(res.seances || []);
        else setAvailableSeances([]);
        setSeancesLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [form.gender, seasons]);

  const selectedSeance = useMemo(
    () => availableSeances.find((s) => s.id === form.seanceId) || null,
    [availableSeances, form.seanceId]
  );

  const buildPayload = () => {
    const isStudent = form.universityStatus === "طالب(ة)";
    const isGraduate = form.universityStatus === "خريج(ة)";
    const school = isStudent
      ? form.studentDetails.trim()
      : isGraduate
        ? form.graduateSchool.trim()
        : "";
    const level = form.universityStatus || "";
    const hizfAmount =
      form.hasExperience === "نعم" ? form.hizbCount.trim() : "";

    const formAnswers = {
      universityStatus: form.universityStatus,
      studentDetails: isStudent ? form.studentDetails.trim() : "",
      graduateSchool: isGraduate ? form.graduateSchool.trim() : "",
      hasExperience: form.hasExperience,
      hizbCount: hizfAmount,
      seasonGoal: form.seasonGoal.trim(),
      difficulties: form.difficulties.trim(),
      desiredActivities: form.desiredActivities.trim(),
    };

    return {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      gender: form.gender,
      school,
      level,
      hifzAmount: hizfAmount,
      seanceId: form.seanceId,
      seanceName: selectedSeance
        ? formatSeanceScheduleLabel(selectedSeance)
        : "",
      seasonId: getActiveRegularSeason(seasons)?.id || null,
      formAnswers,
    };
  };

  const handleSubmit = async () => {
    if (!String(form.fullName || "").trim()) {
      Alert.alert("تنبيه", "أدخل الاسم الكامل");
      return;
    }
    if (!String(form.phone || "").trim()) {
      Alert.alert("تنبيه", "أدخل رقم الهاتف");
      return;
    }
    if (!String(form.email || "").trim().includes("@")) {
      Alert.alert("تنبيه", "أدخل بريداً إلكترونياً صالحاً");
      return;
    }
    if (!form.gender) {
      Alert.alert("تنبيه", "اختر الجنس (ذكر أو أنثى)");
      return;
    }
    if (!form.universityStatus) {
      Alert.alert("تنبيه", "هل أنت طالب(ة) أو خريج(ة)؟");
      return;
    }
    if (
      form.universityStatus === "طالب(ة)" &&
      !String(form.studentDetails || "").trim()
    ) {
      Alert.alert("تنبيه", "أدخل الكلية أو المدرسة ومستواك الدراسي");
      return;
    }
    if (
      form.universityStatus === "خريج(ة)" &&
      !String(form.graduateSchool || "").trim()
    ) {
      Alert.alert("تنبيه", "أدخل الكلية أو المدرسة التي تابعت فيها دراستك");
      return;
    }
    if (!form.hasExperience) {
      Alert.alert("تنبيه", "أجب عن تجربة حفظ القرآن تحت تأطير");
      return;
    }
    if (!form.seanceId) {
      Alert.alert("تنبيه", "اختر الحصة المناسبة لجنسك");
      return;
    }
    if (!String(form.seasonGoal || "").trim()) {
      Alert.alert("تنبيه", "أدخل المقدار الذي تطمح لحفظه هذا الموسم");
      return;
    }

    setSubmitting(true);
    const result = await submitMemberApplication(buildPayload());
    setSubmitting(false);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    setSubmittedId(result.registration.id);
  };

  const refreshStatus = () => {
    const found = findRegistrationByPhone(form.phone || submitted?.phone);
    if (!found) {
      Alert.alert("تنبيه", "لم يُعثر على طلب بهذا الرقم");
      return;
    }
    setSubmittedId(found.id);
  };

  const answers = submitted?.formAnswers || {};

  if (submitted) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <Header />
          <View style={styles.formContainer}>
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
              <Text style={styles.successBadgeText}>تم إرسال الطلب</Text>
            </View>
            <Text style={styles.cardTitle}>متابعة الطلب</Text>
            <Text style={styles.cardSubtitle}>
              سيظهر طلبك للمشرف العام للمراجعة. عند القبول ستصلك دعوة على البريد
              الإلكتروني لإنشاء الحساب — هذه الخطوة للأعضاء الجدد فقط.
            </Text>

            <View style={styles.statusPill}>
              <Text style={styles.statusPillLabel}>الحالة الحالية</Text>
              <Text style={styles.statusPillValue}>
                {REGISTRATION_STATUS_LABELS[submitted.status] || submitted.status}
              </Text>
            </View>

            <View style={styles.infoRows}>
              <InfoRow icon="person-outline" label="الاسم" value={submitted.fullName} />
              {submitted.email ? (
                <InfoRow icon="mail-outline" label="البريد" value={submitted.email} />
              ) : null}
              <InfoRow icon="call-outline" label="الهاتف" value={submitted.phone} />
              {submitted.gender ? (
                <InfoRow
                  icon="male-female-outline"
                  label="الجنس"
                  value={submitted.gender}
                />
              ) : null}
              {answers.universityStatus ? (
                <InfoRow
                  icon="school-outline"
                  label="طالب / خريج"
                  value={answers.universityStatus}
                />
              ) : null}
              {submitted.school ? (
                <InfoRow
                  icon="business-outline"
                  label="الكلية / المدرسة"
                  value={submitted.school}
                />
              ) : null}
              {submitted.hifzAmount ? (
                <InfoRow
                  icon="book-outline"
                  label="عدد الأحزاب"
                  value={submitted.hifzAmount}
                />
              ) : null}
              {submitted.seanceName ? (
                <InfoRow
                  icon="calendar-outline"
                  label="الحصة"
                  value={submitted.seanceName}
                />
              ) : null}
              {answers.seasonGoal ? (
                <InfoRow
                  icon="flag-outline"
                  label="هدف الموسم"
                  value={answers.seasonGoal}
                />
              ) : null}
            </View>

            {submitted.status === REGISTRATION_STATUS.INVITED ? (
              <TouchableOpacity
                style={styles.loginButton}
                onPress={() =>
                  navigation.navigate("ActivateAccount", {
                    email: submitted.email || "",
                  })
                }
                activeOpacity={0.85}
              >
                <Text style={styles.loginButtonText}>إنشاء الحساب</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={refreshStatus}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>تحديث الحالة</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => navigation.navigate("Login")}
            >
              <Text style={styles.forgotPasswordLink}>العودة لتسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Header />

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <FieldLabel required>الاسم الكامل</FieldLabel>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="أحمد محمد"
                  placeholderTextColor={colors.placeholder}
                  value={form.fullName}
                  onChangeText={(v) => setField("fullName", v)}
                  textAlign={textAlignStart}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <FieldLabel required>رقم الهاتف</FieldLabel>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="06xxxxxxxx"
                  placeholderTextColor={colors.placeholder}
                  value={form.phone}
                  onChangeText={(v) => setField("phone", v)}
                  keyboardType="phone-pad"
                  textAlign={textAlignStart}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <FieldLabel required>البريد الإلكتروني</FieldLabel>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="quran@gmail.com"
                  placeholderTextColor={colors.placeholder}
                  value={form.email}
                  onChangeText={(v) => setField("email", v)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textAlign={textAlignStart}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <FieldLabel required>ذكر أم أنثى ؟</FieldLabel>
              <ChipGroup
                options={GENDER_OPTIONS}
                value={form.gender}
                onChange={(v) => setField("gender", v)}
              />
            </View>

            <View style={styles.inputGroup}>
              <FieldLabel required>
                هل أنت طالب أو خريج في جامعة محمد الأول وجدة؟
              </FieldLabel>
              <ChipGroup
                options={UNIVERSITY_OPTIONS}
                value={form.universityStatus}
                onChange={(v) => setField("universityStatus", v)}
              />
            </View>

            {form.universityStatus === "طالب(ة)" ? (
              <View style={styles.inputGroup}>
                <FieldLabel required>
                  بأي كلية أو مدرسة تتابع دراستك؟ وماهو مستواك الدراسي؟
                </FieldLabel>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    placeholder="مثال: كلية العلوم — السنة الثانية"
                    placeholderTextColor={colors.placeholder}
                    value={form.studentDetails}
                    onChangeText={(v) => setField("studentDetails", v)}
                    multiline
                    textAlign={textAlignStart}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            ) : null}

            {form.universityStatus === "خريج(ة)" ? (
              <View style={styles.inputGroup}>
                <FieldLabel required>
                  ماهي الكلية أو المدرسة التي تابعت فيها دراستك؟
                </FieldLabel>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="مثال: المدرسة الوطنية للعلوم التطبيقية"
                    placeholderTextColor={colors.placeholder}
                    value={form.graduateSchool}
                    onChangeText={(v) => setField("graduateSchool", v)}
                    textAlign={textAlignStart}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <FieldLabel required>
                هل سبق وعشت تجربة حفظ القرآن الكريم تحت تأطير أحدهم؟
              </FieldLabel>
              <ChipGroup
                options={YES_NO_OPTIONS}
                value={form.hasExperience}
                onChange={(v) => setField("hasExperience", v)}
              />
            </View>

            {form.hasExperience === "نعم" ? (
              <View style={styles.inputGroup}>
                <FieldLabel>كم عدد الأحزاب التي تحفظها؟</FieldLabel>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="مثال: 5"
                    placeholderTextColor={colors.placeholder}
                    value={form.hizbCount}
                    onChangeText={(v) => setField("hizbCount", v)}
                    keyboardType="numeric"
                    textAlign={textAlignStart}
                  />
                </View>
              </View>
            ) : null}

            {form.gender ? (
              <View style={styles.inputGroup}>
                <FieldLabel required>الحصة</FieldLabel>
                <Text style={styles.hintInline}>
                  الحصص المعروضة حسب الجنس الذي اخترته — يضيفها المشرف العام فقط
                </Text>
                {seancesLoading ? (
                  <Text style={styles.hintText}>جاري تحميل الحصص المتاحة...</Text>
                ) : availableSeances.length === 0 ? (
                  <Text style={styles.hintText}>
                    لا توجد حصص متاحة حالياً لهذا الجنس
                  </Text>
                ) : (
                  <ChipGroup
                    columns
                    options={availableSeances.map((s) => ({
                      value: s.id,
                      label: formatSeanceScheduleLabel(s),
                    }))}
                    value={form.seanceId}
                    onChange={(v) => setField("seanceId", v)}
                  />
                )}
              </View>
            ) : (
              <Text style={styles.hintText}>
                اختر الجنس أولاً لعرض الحصص المتاحة
              </Text>
            )}

            <View style={styles.inputGroup}>
              <FieldLabel required>
                ما هو المقدار الذي تطمح لحفظه من كتاب الله خلال هذا الموسم؟
              </FieldLabel>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="مثال: 5 أحزاب"
                  placeholderTextColor={colors.placeholder}
                  value={form.seasonGoal}
                  onChangeText={(v) => setField("seasonGoal", v)}
                  multiline
                  textAlign={textAlignStart}
                  textAlignVertical="top"
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
                  value={form.difficulties}
                  onChangeText={(v) => setField("difficulties", v)}
                  multiline
                  textAlign={textAlignStart}
                  textAlignVertical="top"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <FieldLabel>
                ما هي البرامج أو الأنشطة التي تود أن تجدها في مشروع مهندس حامل
                لكتاب الله لتثري تجربتك؟
              </FieldLabel>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="اختياري"
                  placeholderTextColor={colors.placeholder}
                  value={form.desiredActivities}
                  onChangeText={(v) => setField("desiredActivities", v)}
                  multiline
                  textAlign={textAlignStart}
                  textAlignVertical="top"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginButton, submitting && { opacity: 0.6 }]}
              onPress={submitting ? undefined : handleSubmit}
              activeOpacity={0.85}
            >
              <Text style={styles.loginButtonText}>
                {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => navigation.navigate("Login")}
            >
              <Text style={styles.forgotPasswordLink}>
                لديك حساب بالفعل؟ تسجيل الدخول
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <>
      <View style={styles.logoContainer}>
        <Image
          source={require("../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <View style={styles.headerContainer}>
        <Text style={styles.titleMain}>مهندس حامل لكتاب الله</Text>
        <Text style={styles.subtitleMain}>طلب انضمام — النسخة السادسة</Text>
        <View style={styles.divider} />
      </View>
    </>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoTextCol}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1 },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 20 : 40,
    paddingBottom: 30,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: Platform.OS === "ios" ? 10 : 20,
  },
  logo: { width: 160, height: 160 },
  headerContainer: { alignItems: "center", marginBottom: 24 },
  titleMain: {
    fontSize: 26,
    fontWeight: "bold",
    color: colors.primary,
    textAlign: "center",
    marginBottom: 8,
    writingDirection: "rtl",
  },
  subtitleMain: {
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 16,
    writingDirection: "rtl",
  },
  divider: {
    width: 80,
    height: 4,
    backgroundColor: colors.gold,
    borderRadius: 2,
    marginTop: 8,
  },
  formContainer: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 20,
    marginBottom: 24,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 6,
    ...rtlText,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: 18,
    ...rtlText,
  },
  inputGroup: { marginBottom: 20 },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
    ...rtlText,
    alignSelf: "stretch",
    lineHeight: 22,
  },
  requiredMark: { color: colors.red },
  inputWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    ...rtlText,
  },
  multiline: {
    minHeight: 88,
    paddingTop: 14,
  },
  chipRow: {
    flexDirection: "row",
    gap: 10,
  },
  chipColumn: {
    gap: 8,
  },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bg,
    alignItems: "center",
  },
  seanceChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.bg,
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipText: {
    ...rtlText,
    color: colors.muted,
    fontSize: 15,
    fontWeight: "500",
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: "bold",
  },
  hintText: {
    ...rtlText,
    color: colors.muted,
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  hintInline: {
    ...rtlText,
    color: colors.muted,
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 18,
  },
  loginButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: 8,
  },
  loginButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: row,
    gap: 8,
    marginTop: 12,
    backgroundColor: colors.primarySoft,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  linkBtn: { marginTop: 20, alignItems: "center" },
  forgotPasswordLink: {
    fontSize: 15,
    color: colors.gold,
    textAlign: "center",
    textDecorationLine: "underline",
    writingDirection: "rtl",
    fontWeight: "500",
  },
  successBadge: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  successBadgeText: {
    color: colors.primaryDark,
    fontWeight: "600",
    fontSize: 14,
  },
  statusPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  statusPillLabel: {
    ...rtlText,
    color: colors.muted,
    fontSize: 13,
    marginBottom: 4,
  },
  statusPillValue: {
    ...rtlText,
    fontSize: 18,
    fontWeight: "bold",
    color: colors.primary,
  },
  infoRows: { gap: 10, marginBottom: 8 },
  infoRow: {
    flexDirection: row,
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTextCol: { flex: 1, marginEnd: 10 },
  infoLabel: {
    ...rtlText,
    color: colors.muted,
    fontSize: 12,
  },
  infoValue: {
    ...rtlText,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginTop: 2,
  },
});
