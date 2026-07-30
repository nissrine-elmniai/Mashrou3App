import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { useApp } from "../context/AppContext";
import {
  LEVEL_OPTIONS,
  REGISTRATION_STATUS,
  REGISTRATION_STATUS_LABELS,
} from "../constants/roles";
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
  {
    key: "hifzAmount",
    label: "مقدار الحفظ",
    placeholder: "مثال: 5 أحزاب أو 10 صفحات",
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
    hifzAmount: "",
  });
  const [submittedId, setSubmittedId] = useState(null);

  const submitted = useMemo(
    () => registrations.find((r) => r.id === submittedId) || null,
    [registrations, submittedId]
  );

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    const seasonId =
      seasons.find((s) => s.active)?.id || seasons[0]?.id || null;
    const result = submitMemberApplication({
      ...form,
      seasonId,
    });
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
      <SafeAreaView style={styles.safeArea}>
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
              الإلكتروني لإنشاء الحساب.
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
              {submitted.hifzAmount ? (
                <InfoRow
                  icon="book-outline"
                  label="مقدار الحفظ"
                  value={submitted.hifzAmount}
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
    <SafeAreaView style={styles.safeArea}>
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

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleSubmit}
              activeOpacity={0.85}
            >
              <Text style={styles.loginButtonText}>إرسال الطلب</Text>
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
