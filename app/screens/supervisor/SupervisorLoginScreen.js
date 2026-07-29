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
  Alert,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { ROLES } from "../../constants/roles";
import { colors, radii, shadows } from "../../constants/theme";
import { fonts, rtlText, textAlignStart } from "../../constants/rtl";

export default function SupervisorLoginScreen({ navigation }) {
  const { login, logout, currentUser } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focused, setFocused] = useState(null);

  useEffect(() => {
    if (currentUser?.role === ROLES.SUPERVISOR) {
      navigation.reset({
        index: 0,
        routes: [{ name: "SupervisorDashboard" }],
      });
    }
  }, [currentUser, navigation]);

  const handleLogin = () => {
    if (!email || !password) {
      Alert.alert("تنبيه", "أدخل البريد وكلمة المرور");
      return;
    }
    const result = login(email, password);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    if (result.user.role !== ROLES.SUPERVISOR) {
      logout();
      Alert.alert("خطأ", "هذا الحساب ليس حساب مشرف");
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: "SupervisorDashboard" }],
    });
  };

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
          <TouchableOpacity
            style={styles.backChip}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            <Text style={styles.backChipText}>رجوع</Text>
          </TouchableOpacity>

          <View style={styles.headerBlock}>
            <Image
              source={require("../../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.brandTitle}>مهندس حامل لكتاب الله</Text>
            <Text style={styles.brandSubtitle}>تسجيل دخول المشرف</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>مسؤول فرعي</Text>
            <Text style={styles.cardSubtitle}>
              سجّل الدخول ببريدك وكلمة المرور. إذا كانت هذه أول مرة، أنشئ حسابك
              بالبريد الذي أُضيف به في قائمة المشرفين.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>البريد الإلكتروني</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focused === "email" && styles.inputWrapperFocused,
                ]}
              >
                <TextInput
                  style={styles.input}
                  placeholder="supervisor@mosque.ma"
                  placeholderTextColor={colors.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textAlign={textAlignStart}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                />
                <View style={styles.inputIcon}>
                  <Ionicons
                    name="mail-outline"
                    size={20}
                    color={focused === "email" ? colors.primary : colors.muted}
                  />
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>كلمة المرور</Text>
              <View
                style={[
                  styles.inputWrapper,
                  focused === "password" && styles.inputWrapperFocused,
                ]}
              >
                <TextInput
                  style={styles.input}
                  placeholder="********"
                  placeholderTextColor={colors.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  textAlign={textAlignStart}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                />
                <View style={styles.inputIcon}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={
                      focused === "password" ? colors.primary : colors.muted
                    }
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>تسجيل الدخول</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate("ForgotPassword")}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotLink}>نسيت كلمة المرور؟</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                navigation.navigate("ActivateAccount", { role: "supervisor" })
              }
              activeOpacity={0.85}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
              <Text style={styles.secondaryButtonText}>إنشاء حساب لأول مرة</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    marginTop: 6,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 17,
    fontFamily: fonts.bold,
  },
  forgotBtn: { alignItems: "center", marginTop: 14 },
  forgotLink: {
    color: colors.gold,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    textDecorationLine: "underline",
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18,
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 13,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.primarySoft,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontFamily: fonts.semiBold,
  },
});
