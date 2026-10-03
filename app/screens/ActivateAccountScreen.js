import React, { useEffect, useState } from "react";
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
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../context/AppContext";
import { colors, radii, shadows } from "../constants/theme";
import { rtlText, row, textAlignStart } from "../constants/rtl";
import { ROLES } from "../constants/roles";
import { requestActivationCode } from "../lib/auth";

const RESEND_DELAY_SEC = 60;

export default function ActivateAccountScreen({ navigation, route }) {
  const { activateInvite, activateSupervisorAccount } = useApp();
  const isSupervisor = route?.params?.role === "supervisor";
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(route?.params?.email || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setInterval(() => {
      setResendIn((left) => (left <= 1 ? 0 : left - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const handleSendCode = async () => {
    if (submitting || resendIn > 0) return;
    const mail = email.trim();
    if (!mail || !mail.includes("@")) {
      Alert.alert("تنبيه", "أدخل بريداً إلكترونياً صالحاً");
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestActivationCode({
        email: mail,
        role: isSupervisor ? ROLES.SUPERVISOR : ROLES.MEMBER,
      });
      if (!result.ok) {
        Alert.alert("خطأ", result.error);
        return;
      }
      setStep("code");
      setResendIn(RESEND_DELAY_SEC);
      Alert.alert(
        "تم",
        "إذا كان لهذا البريد دعوة معلّقة، سيصلك رمز مكوّن من 6 أرقام خلال دقائق."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async () => {
    if (submitting) return;
    if (!/^\d{6}$/.test(code.trim())) {
      Alert.alert("تنبيه", "أدخل رمز التحقق المكوّن من 6 أرقام");
      return;
    }
    setSubmitting(true);
    try {
      const result = isSupervisor
        ? await activateSupervisorAccount({
            email,
            password,
            confirmPassword,
            code: code.trim(),
          })
        : await activateInvite({
            email,
            password,
            confirmPassword,
            code: code.trim(),
          });
      if (!result.ok) {
        Alert.alert("خطأ", result.error);
        return;
      }
      const message = result.needsEmailConfirmation
        ? "تم إنشاء الحساب. أكّد بريدك الإلكتروني ثم سجّل الدخول."
        : "تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن.";
      const fullMessage = result.warning
        ? `${message}\n\nتنبيه: ${result.warning}`
        : message;
      Alert.alert("نجاح", fullMessage, [
        {
          text: "تسجيل الدخول",
          onPress: () => navigation.navigate("Login"),
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

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
          <View style={styles.logoContainer}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.headerContainer}>
            <Text style={styles.titleMain}>مهندس حامل لكتاب الله</Text>
            <Text style={styles.subtitleMain}>
              {isSupervisor
                ? "إنشاء حساب المشرف"
                : "إنشاء حساب العضو"}
            </Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.formContainer}>
            {step === "email" ? (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>البريد الإلكتروني</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.input}
                      placeholder="quran@gmail.com"
                      placeholderTextColor={colors.placeholder}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      textAlign={textAlignStart}
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.loginButton, submitting && { opacity: 0.7 }]}
                  onPress={handleSendCode}
                  activeOpacity={0.85}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.loginButtonText}>إرسال الرمز</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>البريد الإلكتروني</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.input}
                      placeholder="quran@gmail.com"
                      placeholderTextColor={colors.placeholder}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      textAlign={textAlignStart}
                    />
                  </View>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>رمز التحقق</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      style={styles.input}
                      placeholder="000000"
                      placeholderTextColor={colors.placeholder}
                      value={code}
                      onChangeText={(value) =>
                        setCode(value.replace(/\D/g, "").slice(0, 6))
                      }
                      keyboardType="number-pad"
                      maxLength={6}
                      textAlign={textAlignStart}
                    />
                  </View>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>كلمة المرور</Text>
                  <View style={styles.passwordWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="*********"
                      placeholderTextColor={colors.placeholder}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      textAlign={textAlignStart}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color={colors.muted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>تأكيد كلمة المرور</Text>
                  <View style={styles.passwordWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="*********"
                      placeholderTextColor={colors.placeholder}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirm}
                      textAlign={textAlignStart}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowConfirm((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={showConfirm ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color={colors.muted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.loginButton, submitting && { opacity: 0.7 }]}
                  onPress={handleActivate}
                  activeOpacity={0.85}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.loginButtonText}>إنشاء الحساب</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={handleSendCode}
                  disabled={submitting || resendIn > 0}
                >
                  <Text
                    style={[
                      styles.forgotPasswordLink,
                      (submitting || resendIn > 0) && { opacity: 0.5 },
                    ]}
                  >
                    {resendIn > 0
                      ? `إعادة إرسال الرمز (${resendIn})`
                      : "إعادة إرسال الرمز"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => navigation.navigate("Login")}
            >
              <Text style={styles.forgotPasswordLink}>
                العودة لتسجيل الدخول
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  passwordWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    flexDirection: row,
    alignItems: "center",
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    ...rtlText,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    ...rtlText,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
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
  linkBtn: { alignItems: "center", marginTop: 20 },
  forgotPasswordLink: {
    fontSize: 15,
    color: colors.gold,
    textAlign: "center",
    textDecorationLine: "underline",
    writingDirection: "rtl",
    fontWeight: "500",
  },
});
