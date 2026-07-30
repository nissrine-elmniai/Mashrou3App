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
import { rtlText, row, textAlignStart } from "../constants/rtl";

export default function ActivateAccountScreen({ navigation, route }) {
  const { activateInvite, activateSupervisorAccount } = useApp();
  const isSupervisor = route?.params?.role === "supervisor";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(route?.params?.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleActivate = async () => {
    if (isSupervisor) {
      const result = await activateSupervisorAccount({
        fullName,
        email,
        password,
        confirmPassword,
      });
      if (!result.ok) {
        Alert.alert("خطأ", result.error);
        return;
      }
      const message = result.needsEmailConfirmation
        ? "تم إنشاء الحساب. أكّد بريدك الإلكتروني ثم سجّل الدخول."
        : "تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن.";
      Alert.alert("نجاح", message, [
        {
          text: "تسجيل الدخول",
          onPress: () => navigation.navigate("Login"),
        },
      ]);
      return;
    }

    const result = await activateInvite({
      email,
      password,
      confirmPassword,
    });
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    const message = result.needsEmailConfirmation
      ? "تم إنشاء الحساب. أكّد بريدك الإلكتروني ثم سجّل الدخول."
      : "تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن.";
    Alert.alert("نجاح", message, [
      {
        text: "تسجيل الدخول",
        onPress: () => navigation.navigate("Login"),
      },
    ]);
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
            {isSupervisor ? (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>الاسم الكامل</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="كما هو مسجّل لدى الإدارة"
                    placeholderTextColor={colors.placeholder}
                    value={fullName}
                    onChangeText={setFullName}
                    textAlign={textAlignStart}
                  />
                </View>
              </View>
            ) : null}

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
              style={styles.loginButton}
              onPress={handleActivate}
              activeOpacity={0.85}
            >
              <Text style={styles.loginButtonText}>إنشاء الحساب</Text>
            </TouchableOpacity>

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
