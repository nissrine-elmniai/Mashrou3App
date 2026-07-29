import React, { useState } from "react";
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
import { useApp } from "../context/AppContext";
import { colors, radii, shadows } from "../constants/theme";
import { fonts, rtlText, row, textAlignStart } from "../constants/rtl";
import RegistrationStepper from "../components/RegistrationStepper";

const SUPERVISOR_FIELDS = [
  {
    key: "fullName",
    label: "الاسم الكامل",
    placeholder: "أحمد محمد",
    icon: "person-outline",
  },
  {
    key: "email",
    label: "البريد الإلكتروني",
    placeholder: "supervisor@mosque.ma",
    icon: "mail-outline",
    keyboardType: "email-address",
    autoCapitalize: "none",
  },
  {
    key: "password",
    label: "كلمة المرور",
    placeholder: "********",
    icon: "lock-closed-outline",
    secureTextEntry: true,
  },
  {
    key: "confirmPassword",
    label: "تأكيد كلمة المرور",
    placeholder: "********",
    icon: "lock-closed-outline",
    secureTextEntry: true,
  },
];

export default function ActivateAccountScreen({ navigation, route }) {
  const { activateInvite, activateSupervisorAccount } = useApp();
  const isSupervisor = route?.params?.role === "supervisor";
  const [token, setToken] = useState(route?.params?.token || "");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [focused, setFocused] = useState(null);

  const handleActivate = () => {
    const result = isSupervisor
      ? activateSupervisorAccount({
          fullName,
          email,
          password,
          confirmPassword,
        })
      : activateInvite({ token, password, confirmPassword });
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    const loginRoute =
      result.role === "supervisor" ? "SupervisorLogin" : "Login";
    Alert.alert("نجاح", "تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن.", [
      {
        text: "تسجيل الدخول",
        onPress: () => navigation.navigate(loginRoute),
      },
    ]);
  };

  const supervisorValues = { fullName, email, password, confirmPassword };
  const setSupervisorField = (key, value) => {
    if (key === "fullName") setFullName(value);
    if (key === "email") setEmail(value);
    if (key === "password") setPassword(value);
    if (key === "confirmPassword") setConfirmPassword(value);
  };

  if (isSupervisor) {
    return (
      <SafeAreaView style={styles.supervisorSafeArea}>
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
            <TouchableOpacity
              style={styles.backChip}
              onPress={() => navigation.navigate("SupervisorLogin")}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
              <Text style={styles.backChipText}>رجوع</Text>
            </TouchableOpacity>

            <View style={styles.headerBlock}>
              <Image
                source={require("../assets/logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.brandTitle}>مهندس حامل لكتاب الله</Text>
              <Text style={styles.brandSubtitle}>إنشاء حساب المشرف</Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.formCard}>
              <View style={styles.badge}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={22}
                  color={colors.primary}
                />
                <Text style={styles.badgeText}>مسؤول فرعي</Text>
              </View>

              <Text style={styles.cardTitle}>إنشاء حساب المشرف</Text>
              <Text style={styles.cardSubtitle}>
                أدخل اسمك الكامل والبريد الإلكتروني كما سجّلهما المشرف العام،
                ثم عيّن كلمة المرور لإكمال التفعيل.
              </Text>

              {SUPERVISOR_FIELDS.map((field) => {
                const isFocused = focused === field.key;
                return (
                  <View key={field.key} style={styles.inputGroup}>
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
                        value={supervisorValues[field.key]}
                        onChangeText={(v) => setSupervisorField(field.key, v)}
                        keyboardType={field.keyboardType}
                        autoCapitalize={field.autoCapitalize || "sentences"}
                        secureTextEntry={field.secureTextEntry}
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
                );
              })}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleActivate}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>إنشاء الحساب</Text>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => navigation.navigate("SupervisorLogin")}
              >
                <Text style={styles.link}>لديك حساب بالفعل؟ تسجيل الدخول</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
          keyboardShouldPersistTaps="handled"
        >
          <RegistrationStepper activeStep={5} />
          <Text style={styles.title}>إنشاء حساب</Text>
          <Text style={styles.hint}>
            أدخل رمز الدعوة المرسل إليك ثم عيّن كلمة المرور لتفعيل الحساب.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>رمز الدعوة</Text>
            <View style={styles.inputWrapperBasic}>
              <TextInput
                style={styles.input}
                placeholder="INV-XXXXXX"
                placeholderTextColor={colors.placeholder}
                value={token}
                onChangeText={setToken}
                autoCapitalize="characters"
                textAlign={textAlignStart}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>كلمة المرور</Text>
            <View style={styles.inputWrapperBasic}>
              <TextInput
                style={styles.input}
                placeholder="********"
                placeholderTextColor={colors.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textAlign={textAlignStart}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>تأكيد كلمة المرور</Text>
            <View style={styles.inputWrapperBasic}>
              <TextInput
                style={styles.input}
                placeholder="********"
                placeholderTextColor={colors.placeholder}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                textAlign={textAlignStart}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleActivate}>
            <Text style={styles.buttonText}>إنشاء الحساب</Text>
          </TouchableOpacity>

          <View style={styles.links}>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.link}>العودة لتسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  supervisorSafeArea: { flex: 1, backgroundColor: "#F7FAF7" },
  safeArea: { flex: 1, backgroundColor: colors.bg },
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
  backChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
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
  headerBlock: { alignItems: "center", marginBottom: 18 },
  logo: { width: 100, height: 100 },
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
  badge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  badgeText: {
    color: colors.primaryDark,
    fontFamily: fonts.semiBold,
    fontSize: 13,
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
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
    ...rtlText,
  },
  hint: {
    ...rtlText,
    color: colors.muted,
    marginBottom: 20,
    lineHeight: 22,
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
    flexDirection: "row",
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
  inputWrapperBasic: {
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
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
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 17,
    fontFamily: fonts.bold,
  },
  linkBtn: { alignItems: "center", marginTop: 16 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: 18,
  },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  links: {
    flexDirection: row,
    justifyContent: "center",
    marginTop: 20,
  },
  link: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
