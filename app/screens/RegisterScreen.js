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
import { useApp } from "../context/AppContext";
import { colors, radii, shadows } from "../constants/theme";

export default function RegisterScreen({ navigation }) {
  const { registerAccount } = useApp();
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleRegister = () => {
    if (!nom || !prenom || !dateNaissance || !email || !password || !confirmPassword) {
      Alert.alert("خطأ", "الرجاء ملء جميع الحقول");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("خطأ", "كلمة المرور غير متطابقة");
      return;
    }

    const result = registerAccount({
      firstName: prenom,
      lastName: nom,
      birthDate: dateNaissance,
      email,
      password,
    });

    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }

    Alert.alert("نجاح", "تم إنشاء الحساب. يمكنك الآن التسجيل في الموسم بعد تسجيل الدخول.");
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
        >
          <View style={styles.logoContainer}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={styles.headerContainer}>
            <Text style={styles.titleMain}>إنشاء حساب جديد</Text>
            <Text style={styles.hint}>حساب العضو للانخراط في حلقات التحفيظ</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.formContainer}>
            <Field label="الاسم" value={prenom} onChange={setPrenom} placeholder="أحمد" />
            <Field label="اللقب" value={nom} onChange={setNom} placeholder="محمد" />
            <Field
              label="تاريخ الميلاد"
              value={dateNaissance}
              onChange={setDateNaissance}
              placeholder="2000/01/01"
            />
            <Field
              label="البريد الإلكتروني"
              value={email}
              onChange={setEmail}
              placeholder="quran@gmail.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              label="كلمة المرور"
              value={password}
              onChange={setPassword}
              placeholder="********"
              secure
            />
            <Field
              label="تأكيد كلمة المرور"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="********"
              secure
            />

            <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
              <Text style={styles.registerButtonText}>إنشاء الحساب</Text>
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  autoCapitalize,
  keyboardType,
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={onChange}
          secureTextEntry={!!secure}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          textAlign="right"
        />
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
    marginTop: Platform.OS === "ios" ? 10 : 5,
  },
  logo: { width: 100, height: 100 },
  headerContainer: { alignItems: "center", marginBottom: 30 },
  titleMain: {
    fontSize: 26,
    fontWeight: "bold",
    color: colors.primary,
    textAlign: "center",
    marginBottom: 8,
    writingDirection: "rtl",
  },
  hint: { color: colors.muted, textAlign: "center", marginBottom: 8 },
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
  inputGroup: { marginBottom: 16 },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 6,
    textAlign: "right",
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    textAlign: "right",
  },
  registerButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  registerButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  loginText: { fontSize: 15, color: colors.muted },
  loginLink: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
    marginLeft: 5,
    textDecorationLine: "underline",
  },
});
