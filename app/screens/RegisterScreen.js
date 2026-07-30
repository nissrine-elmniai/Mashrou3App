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
import { fonts, rtlText, row, textAlignStart } from "../constants/rtl";

const FIELDS = [
  {
    key: "fullName",
    label: "الاسم الكامل",
    placeholder: "أحمد محمد",
    icon: "person-outline",
  },
  {
    key: "email",
    label: "البريد الإلكتروني",
    placeholder: "quran@gmail.com",
    icon: "mail-outline",
    keyboardType: "email-address",
    autoCapitalize: "none",
  },
  {
    key: "phone",
    label: "رقم الهاتف",
    placeholder: "06xxxxxxxx",
    icon: "call-outline",
    keyboardType: "phone-pad",
  },
  {
    key: "school",
    label: "المدرسة أو الكلية",
    placeholder: "كلية العلوم",
    icon: "school-outline",
  },
  {
    key: "hifzAmount",
    label: "مقدار الحفظ",
    placeholder: "مثال: 5 أحزاب أو 10 صفحات",
    icon: "book-outline",
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
  const [focused, setFocused] = useState(null);
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
        <View style={styles.bgBlob} />
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          <Header navigation={navigation} />
          <View style={styles.formCard}>
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

            {submitted.inviteToken ? (
              <View style={styles.tokenBox}>
                <Text style={styles.tokenLabel}>رمز الدعوة</Text>
                <Text style={styles.tokenValue}>{submitted.inviteToken}</Text>
                <Text style={styles.tokenHint}>
                  احتفظ بهذا الرمز لإنشاء حسابك
                </Text>
              </View>
            ) : null}

            {submitted.status === REGISTRATION_STATUS.INVITED ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() =>
                  navigation.navigate("ActivateAccount", {
                    token: submitted.inviteToken || "",
                  })
                }
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>إنشاء الحساب</Text>
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
              <Text style={styles.loginLink}>العودة لتسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.bgBlob} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Header navigation={navigation} />

          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>عضو جديد</Text>
            <Text style={styles.cardSubtitle}>
              أرسل طلب الانضمام، وبعد القبول ستتلقى دعوة لإنشاء الحساب.
            </Text>

            {FIELDS.map((field) => {
              const isFocused = focused === field.key;
              const afterSchool =
                field.key === "school" ? (
                  <View key="level" style={styles.inputGroup}>
                    <Text style={styles.label}>مستوى حفظ القرآن</Text>
                    <View style={styles.pickerWrapper}>
                      <Ionicons
                        name="layers-outline"
                        size={20}
                        color={form.level ? colors.primary : colors.muted}
                        style={styles.pickerIcon}
                      />
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
                    <View
                      style={[
                        styles.inputWrapper,
                        isFocused && styles.inputWrapperFocused,
                      ]}
                    >
                      <TextInput
                        style={styles.input}
                        placeholder={field.placeholder}
                        placeholderTextColor={colors.placeholder}
                        value={form[field.key]}
                        onChangeText={(v) => setField(field.key, v)}
                        keyboardType={field.keyboardType}
                        autoCapitalize={field.autoCapitalize || "sentences"}
                        textAlign={textAlignStart}
                        onFocus={() => setFocused(field.key)}
                        onBlur={() => setFocused(null)}
                      />
                      <View style={styles.inputIcon}>
                        <Ionicons
                          name={field.icon}
                          size={20}
                          color={isFocused ? colors.primary : colors.muted}
                        />
                      </View>
                    </View>
                  </View>
                  {afterSchool}
                </React.Fragment>
              );
            })}

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSubmit}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>إرسال الطلب</Text>
              <Ionicons name="arrow-back" size={18} color="#fff" />
            </TouchableOpacity>

            <View style={styles.loginContainer}>
              <TouchableOpacity onPress={() => navigation.navigate("Login")}>
                <Text style={styles.loginLink}>تسجيل الدخول</Text>
              </TouchableOpacity>
              <Text style={styles.loginText}>لديك حساب بالفعل؟ </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Header({ navigation }) {
  return (
    <View style={styles.headerBlock}>
      <TouchableOpacity
        style={styles.backChip}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-forward" size={18} color={colors.primary} />
        <Text style={styles.backChipText}>رجوع</Text>
      </TouchableOpacity>

      <Image
        source={require("../assets/logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.brandTitle}>مهندس حامل لكتاب الله</Text>
      <Text style={styles.brandSubtitle}>طلب انضمام لحلقة التحفيظ</Text>
      <View style={styles.divider} />
    </View>
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
  safeArea: { flex: 1, backgroundColor: "#F7FAF7" },
  container: { flex: 1 },
  bgBlob: {
    position: "absolute",
    top: -80,
    start: -40,
    end: -40,
    height: 280,
    backgroundColor: colors.primarySoft,
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 8 : 20,
    paddingBottom: 40,
  },
  headerBlock: {
    alignItems: "center",
    marginBottom: 18,
  },
  backChip: {
    alignSelf: "flex-start",
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    ...shadows.card,
  },
  backChipText: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: 13,
  },
  logo: { width: 110, height: 110, marginTop: 4 },
  brandTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.primary,
    textAlign: "center",
    marginTop: 4,
    writingDirection: "rtl",
  },
  brandSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: "center",
    marginTop: 4,
    writingDirection: "rtl",
  },
  divider: {
    width: 72,
    height: 4,
    backgroundColor: colors.gold,
    borderRadius: 2,
    marginTop: 12,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 20,
    ...shadows.card,
    borderWidth: 1,
    borderColor: "#EEF2EE",
  },
  cardTitle: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 6,
    ...rtlText,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: 18,
    ...rtlText,
  },
  inputGroup: { marginBottom: 14 },
  label: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    marginBottom: 8,
    ...rtlText,
  },
  inputWrapper: {
    flexDirection: row,
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingEnd: 12,
  },
  inputWrapperFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  inputIcon: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  pickerWrapper: {
    flexDirection: row,
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: "hidden",
    paddingStart: 10,
  },
  pickerIcon: {
    marginEnd: 4,
  },
  picker: {
    flex: 1,
    width: "100%",
    color: colors.text,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: row,
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 17,
    fontFamily: fonts.bold,
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: row,
    gap: 8,
    marginTop: 8,
    backgroundColor: colors.primarySoft,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontFamily: fonts.semiBold,
  },
  loginContainer: {
    flexDirection: row,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 14,
  },
  loginText: {
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  loginLink: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.primary,
    marginStart: 4,
    textDecorationLine: "underline",
  },
  linkBtn: { marginTop: 16, alignItems: "center" },
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
    fontFamily: fonts.semiBold,
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
    fontFamily: fonts.regular,
    fontSize: 13,
    marginBottom: 4,
  },
  statusPillValue: {
    ...rtlText,
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  infoRows: { gap: 10, marginBottom: 8 },
  infoRow: {
    flexDirection: row,
    alignItems: "center",
    backgroundColor: "#F8FAF8",
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: "#EEF2EE",
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
    fontFamily: fonts.regular,
  },
  infoValue: {
    ...rtlText,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.semiBold,
    marginTop: 2,
  },
  tokenBox: {
    marginTop: 12,
    backgroundColor: colors.soft,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  tokenLabel: {
    ...rtlText,
    color: colors.muted,
    marginBottom: 4,
    fontFamily: fonts.regular,
  },
  tokenValue: {
    ...rtlText,
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.primaryDark,
    letterSpacing: 1,
  },
  tokenHint: {
    ...rtlText,
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
});
