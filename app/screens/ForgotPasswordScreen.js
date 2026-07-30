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
  Image,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, shadows } from "../constants/theme";
import { useApp } from "../context/AppContext";
import { rtlText, row, textAlignStart } from "../constants/rtl";

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword, confirmPasswordReset, isSupabaseConfigured } =
    useApp();
  const [step, setStep] = useState("email"); // email | code
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSendCode = async () => {
    if (!email) {
      Alert.alert("خطأ", "الرجاء إدخال البريد الإلكتروني");
      return;
    }

    if (isSupabaseConfigured) {
      setSubmitting(true);
      const result = await resetPassword(email);
      setSubmitting(false);
      if (!result.ok) {
        Alert.alert("خطأ", result.error);
        return;
      }
      setStep("code");
      Alert.alert(
        "تم",
        "تم إرسال رمز التحقق إلى بريدك. أدخله مع كلمة المرور الجديدة."
      );
      return;
    }

    if (password !== confirm) {
      Alert.alert("خطأ", "كلمة المرور غير متطابقة");
      return;
    }
    setSubmitting(true);
    const result = await resetPassword(email, password);
    setSubmitting(false);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    Alert.alert("تم", "تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.");
    navigation.navigate("Login");
  };

  const handleConfirmReset = async () => {
    if (!otp.trim()) {
      Alert.alert("خطأ", "أدخل رمز التحقق المرسل إلى بريدك");
      return;
    }
    if (!password || !confirm) {
      Alert.alert("خطأ", "الرجاء إدخال كلمة المرور الجديدة وتأكيدها");
      return;
    }
    if (password !== confirm) {
      Alert.alert("خطأ", "كلمة المرور غير متطابقة");
      return;
    }
    if (password.length < 6) {
      Alert.alert("خطأ", "كلمة المرور قصيرة جداً (6 أحرف على الأقل)");
      return;
    }

    setSubmitting(true);
    const result = await confirmPasswordReset(email, otp, password);
    setSubmitting(false);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    Alert.alert("تم", "تم تحديث كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.");
    navigation.navigate("Login");
  };

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
          <View style={styles.logoContainer}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>استعادة كلمة المرور</Text>
            <Text style={styles.subtitle}>
              {!isSupabaseConfigured
                ? "أدخل بريدك وكلمة مرور جديدة لحسابك المسجّل في التطبيق"
                : step === "email"
                  ? "أدخل بريدك الإلكتروني لإرسال رمز التحقق"
                  : "أدخل الرمز المستلم من البريد ثم كلمة المرور الجديدة"}
            </Text>
            <View style={styles.divider} />

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
                editable={!(isSupabaseConfigured && step === "code")}
                textAlign={textAlignStart}
              />
            </View>

            {isSupabaseConfigured && step === "code" && (
              <>
                <Text style={styles.label}>رمز التحقق</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="123456"
                    placeholderTextColor={colors.placeholder}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={8}
                    textAlign={textAlignStart}
                  />
                </View>

                <Text style={styles.label}>كلمة المرور الجديدة</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="********"
                    placeholderTextColor={colors.placeholder}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    textAlign={textAlignStart}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((v) => !v)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={colors.muted}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>تأكيد كلمة المرور</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="********"
                    placeholderTextColor={colors.placeholder}
                    value={confirm}
                    onChangeText={setConfirm}
                    secureTextEntry={!showConfirm}
                    textAlign={textAlignStart}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirm((v) => !v)}
                  >
                    <Ionicons
                      name={showConfirm ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={colors.muted}
                    />
                  </TouchableOpacity>
                </View>
              </>
            )}

            {!isSupabaseConfigured && (
              <>
                <Text style={styles.label}>كلمة المرور الجديدة</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="********"
                    placeholderTextColor={colors.placeholder}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    textAlign={textAlignStart}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((v) => !v)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={colors.muted}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>تأكيد كلمة المرور</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="********"
                    placeholderTextColor={colors.placeholder}
                    value={confirm}
                    onChangeText={setConfirm}
                    secureTextEntry={!showConfirm}
                    textAlign={textAlignStart}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirm((v) => !v)}
                  >
                    <Ionicons
                      name={showConfirm ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={colors.muted}
                    />
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.resetButton, submitting && { opacity: 0.7 }]}
              onPress={
                isSupabaseConfigured && step === "code"
                  ? handleConfirmReset
                  : handleSendCode
              }
              disabled={submitting}
            >
              <Text style={styles.resetButtonText}>
                {submitting
                  ? "جارٍ..."
                  : isSupabaseConfigured && step === "code"
                    ? "حفظ كلمة المرور"
                    : isSupabaseConfigured
                      ? "إرسال رمز التحقق"
                      : "حفظ كلمة المرور"}
              </Text>
            </TouchableOpacity>

            {isSupabaseConfigured && step === "code" && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  setStep("email");
                  setOtp("");
                  setPassword("");
                  setConfirm("");
                }}
              >
                <Text style={styles.backButtonText}>إعادة إرسال الرمز</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backButtonText}>العودة إلى تسجيل الدخول</Text>
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
    marginBottom: 20,
    marginTop: Platform.OS === "ios" ? 10 : 20,
  },
  logo: { width: 100, height: 100 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: 24,
    ...shadows.card,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.primary,
    textAlign: "center",
    marginBottom: 10,
    writingDirection: "rtl",
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 16,
    writingDirection: "rtl",
    lineHeight: 22,
  },
  divider: {
    width: 60,
    height: 3,
    backgroundColor: colors.gold,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 8,
    ...rtlText,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.bg,
    marginBottom: 14,
  },
  passwordWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.bg,
    marginBottom: 14,
    flexDirection: row,
    alignItems: "center",
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    ...rtlText,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    ...rtlText,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resetButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  resetButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  backButton: { paddingVertical: 12, alignItems: "center" },
  backButtonText: {
    color: colors.gold,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});
