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
import { Picker } from "@react-native-picker/picker";
import { useApp } from "../context/AppContext";
import {
  LEVEL_OPTIONS,
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

const FIELDS = [
  {
    key: "fullName",
    label: "الاسم الكامل",
    placeholder: "أحمد محمد",
  },
  {
    key: "email",
    label: "البريد الإلكتروني",
    placeholder: "quran@gmail.com",
    keyboardType: "email-address",
    autoCapitalize: "none",
  },
  {
    key: "phone",
    label: "رقم الهاتف",
    placeholder: "06xxxxxxxx",
    keyboardType: "phone-pad",
  },
  {
    key: "school",
    label: "المدرسة أو الكلية",
    placeholder: "كلية العلوم",
  },
];

export default function RegisterScreen({ navigation }) {
  const {
    seasons,
    registrations,
    submitMemberApplication,
    findRegistrationByPhone,
  } = useApp();

  const [form, setForm] = useState({
    fullName: "",
    school: "",
    level: "",
    phone: "",
    email: "",
    gender: "",
    seanceId: "",
  });
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

  const handleSubmit = async () => {
    const seasonId = getActiveRegularSeason(seasons)?.id || null;
    setSubmitting(true);
    const result = await submitMemberApplication({
      ...form,
      seasonId,
      seanceName: selectedSeance
        ? formatSeanceScheduleLabel(selectedSeance)
        : "",
    });
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
                <InfoRow
                  icon="mail-outline"
                  label="البريد"
                  value={submitted.email}
                />
              ) : null}
              <InfoRow icon="call-outline" label="الهاتف" value={submitted.phone} />
              {submitted.school ? (
                <InfoRow
                  icon="school-outline"
                  label="المدرسة"
                  value={submitted.school}
                />
              ) : null}
              {submitted.level ? (
                <InfoRow
                  icon="layers-outline"
                  label="المستوى"
                  value={submitted.level}
                />
              ) : null}
              {submitted.gender ? (
                <InfoRow
                  icon="male-female-outline"
                  label="الجنس"
                  value={submitted.gender}
                />
              ) : null}
              {submitted.seanceName ? (
                <InfoRow
                  icon="calendar-outline"
                  label="الحصة"
                  value={submitted.seanceName}
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
            {FIELDS.map((field) => {
              const afterSchool =
                field.key === "school" ? (
                  <View key="level" style={styles.inputGroup}>
                    <Text style={styles.label}>مستوى حفظ القرآن</Text>
                    <View style={styles.pickerWrapper}>
                      <Picker
                        selectedValue={form.level}
                        onValueChange={(v) => setField("level", v)}
                        style={styles.picker}
                        dropdownIconColor={colors.primary}
                      >
                        <Picker.Item
                          label="اختر مستوى الحفظ"
                          value=""
                          color={colors.placeholder}
                        />
                        {LEVEL_OPTIONS.map((opt) => (
                          <Picker.Item key={opt} label={opt} value={opt} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                ) : null;
              return (
                <React.Fragment key={field.key}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>{field.label}</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder={field.placeholder}
                        placeholderTextColor={colors.placeholder}
                        value={form[field.key]}
                        onChangeText={(v) => setField(field.key, v)}
                        keyboardType={field.keyboardType}
                        autoCapitalize={field.autoCapitalize || "sentences"}
                        textAlign={textAlignStart}
                      />
                    </View>
                  </View>
                  {afterSchool}
                </React.Fragment>
              );
            })}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>الجنس</Text>
              <View style={styles.chipRow}>
                {GENDER_OPTIONS.map((opt) => {
                  const active = form.gender === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setField("gender", opt.value)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {form.gender ? (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>الحصة</Text>
                {seancesLoading ? (
                  <Text style={styles.hintText}>جاري تحميل الحصص المتاحة...</Text>
                ) : availableSeances.length === 0 ? (
                  <Text style={styles.hintText}>
                    لا توجد حصص متاحة حالياً لهذا الجنس
                  </Text>
                ) : (
                  <View style={styles.chipColumn}>
                    {availableSeances.map((seance) => {
                      const active = form.seanceId === seance.id;
                      return (
                        <TouchableOpacity
                          key={seance.id}
                          style={[styles.seanceChip, active && styles.chipActive]}
                          onPress={() => setField("seanceId", seance.id)}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              active && styles.chipTextActive,
                            ]}
                          >
                            {formatSeanceScheduleLabel(seance)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.hintText}>
                اختر الجنس أولاً لعرض الحصص المتاحة
              </Text>
            )}

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
        <Text style={styles.subtitleMain}>عضو جديد — طلب انضمام</Text>
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
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
    ...rtlText,
    alignSelf: "stretch",
  },
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
  pickerWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  picker: {
    width: "100%",
    color: colors.text,
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
