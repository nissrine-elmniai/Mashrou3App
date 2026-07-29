import React, { useEffect, useState } from "react";
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
import { ROLE_LABELS, DASHBOARD_BY_ROLE } from "../constants/roles";
import { colors, radii, shadows } from "../constants/theme";
import { rtlText, row, textAlignStart } from "../constants/rtl";

export default function LoginScreen({ navigation }) {
  const { login, DEMO_PASSWORD, currentUser, resetToSeedData } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (currentUser?.role && DASHBOARD_BY_ROLE[currentUser.role]) {
      navigation.reset({
        index: 0,
        routes: [{ name: DASHBOARD_BY_ROLE[currentUser.role] }],
      });
    }
  }, [currentUser, navigation]);

  const handleLogin = () => {
    if (!username || !password) {
      Alert.alert("تنبيه", "أدخل البريد وكلمة المرور");
      return;
    }
    const result = login(username, password);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: result.dashboard }],
    });
  };

  const quickLogin = (email) => {
    setUsername(email);
    setPassword(DEMO_PASSWORD);
  };

  const handleResetSeed = async () => {
    await resetToSeedData();
    setUsername("");
    setPassword("");
    Alert.alert("تم", "تمت إعادة تعيين بيانات التجربة إلى الحالة الافتراضية");
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
            <Text style={styles.titleMain}>مهندس حامل لكتاب الله</Text>
            <Text style={styles.subtitleMain}>
              منصة إدارة حلقات تحفيظ القرآن الكريم
            </Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>البريد الالكتروني </Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="quran@gmail.com"
                  placeholderTextColor={colors.placeholder}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  textAlign={textAlignStart}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>كلمة المرور</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="*********"
                  placeholderTextColor={colors.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  textAlign={textAlignStart}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
              <Text style={styles.loginButtonText}>تسجيل الدخول</Text>
            </TouchableOpacity>

            <Text style={styles.demoTitle}>حساب المسؤول الأول</Text>
            <TouchableOpacity
              style={styles.demoChip}
              onPress={() => quickLogin("admin@mosque.ma")}
            >
              <Text style={styles.demoText}>
                admin@mosque.ma — {ROLE_LABELS.admin} ({DEMO_PASSWORD})
              </Text>
            </TouchableOpacity>

            <View style={styles.linksContainer}>
              <TouchableOpacity
                onPress={() => navigation.navigate("ForgotPassword")}
              >
                <Text style={styles.forgotPasswordLink}>نسيت كلمة المرور؟</Text>
              </TouchableOpacity>

              <View style={styles.separator} />

              <View style={styles.signupContainer}>
                <TouchableOpacity
                  onPress={() => navigation.navigate("Register")}
                >
                  <Text style={styles.signupLink}>عضو جديد</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate("SupervisorLogin")}
                style={{ marginTop: 14 }}
              >
                <Text style={styles.signupLink}>تسجيل دخول المشرف</Text>
              </TouchableOpacity>
            </View>

            {__DEV__ ? (
              <TouchableOpacity
                onPress={handleResetSeed}
                style={styles.devResetWrapper}
              >
                <Text style={styles.devResetText}>
                  إعادة تعيين بيانات التجربة
                </Text>
              </TouchableOpacity>
            ) : null}
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
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    ...rtlText,
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
  demoTitle: {
    textAlign: "center",
    marginTop: 18,
    marginBottom: 8,
    color: colors.muted,
    fontWeight: "600",
  },
  demoChip: {
    backgroundColor: colors.soft,
    borderRadius: radii.sm,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  demoText: { textAlign: "center", color: colors.primaryDark, fontSize: 13 },
  signupContainer: {
    flexDirection: row,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 10,
  },
  signupText: { fontSize: 15, color: colors.muted, writingDirection: "rtl" },
  signupLink: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
    marginStart: 5,
    textDecorationLine: "underline",
    writingDirection: "rtl",
  },
  linksContainer: { marginTop: 24, alignItems: "center", width: "100%" },
  forgotPasswordLink: {
    fontSize: 15,
    color: colors.gold,
    textAlign: "center",
    marginBottom: 12,
    textDecorationLine: "underline",
    writingDirection: "rtl",
    fontWeight: "500",
  },
  separator: {
    height: 1,
    width: "60%",
    backgroundColor: colors.border,
    marginVertical: 16,
    alignSelf: "center",
  },
  devResetWrapper: { marginTop: 20, alignItems: "center" },
  devResetText: {
    fontSize: 12,
    color: colors.placeholder,
    writingDirection: "rtl",
  },
});
