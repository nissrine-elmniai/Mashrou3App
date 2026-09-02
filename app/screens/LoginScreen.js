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
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../context/AppContext";
import { DASHBOARD_BY_ROLE } from "../constants/roles";
import { colors, radii, shadows } from "../constants/theme";
import { rtlText, row, textAlignStart } from "../constants/rtl";

export default function LoginScreen({ navigation }) {
  const { login, currentUser } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (currentUser?.role && DASHBOARD_BY_ROLE[currentUser.role]) {
      navigation.reset({
        index: 0,
        routes: [{ name: DASHBOARD_BY_ROLE[currentUser.role] }],
      });
    }
  }, [currentUser, navigation]);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("تنبيه", "أدخل البريد وكلمة المرور");
      return;
    }
    const result = await login(username, password);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: result.dashboard }],
    });
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
                  accessibilityLabel={
                    showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                  }
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

            <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
              <Text style={styles.loginButtonText}>تسجيل الدخول</Text>
            </TouchableOpacity>

            <View style={styles.linksContainer}>
              <TouchableOpacity
                onPress={() => navigation.navigate("ForgotPassword")}
              >
                <Text style={styles.forgotPasswordLink}>نسيت كلمة المرور؟</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate("Register")}
                style={styles.simpleLinkRow}
              >
                <Text style={styles.signupLink}>طلب الانضمام</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate("ActivateAccount")}
                style={styles.simpleLinkRow}
              >
                <Text style={styles.signupLink}>عضو جديد</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("ActivateAccount", { role: "supervisor" })
                }
                style={styles.simpleLinkRow}
              >
                <Text style={styles.signupLink}>مشرف جديد</Text>
              </TouchableOpacity>
            </View>
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
  signupLink: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
    textDecorationLine: "underline",
    writingDirection: "rtl",
  },
  simpleLinkRow: {
    marginTop: 14,
    alignItems: "center",
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
});
