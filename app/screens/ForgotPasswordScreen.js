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
import { colors, radii, shadows } from "../constants/theme";
import { useApp } from "../context/AppContext";
import { rtlText, textAlignStart } from "../constants/rtl";

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const handleResetPassword = () => {
    if (!email) {
      Alert.alert("خطأ", "الرجاء إدخال البريد الإلكتروني");
      return;
    }
    if (password !== confirm) {
      Alert.alert("خطأ", "كلمة المرور غير متطابقة");
      return;
    }
    const result = resetPassword(email, password);
    if (!result.ok) {
      Alert.alert("خطأ", result.error);
      return;
    }
    Alert.alert("تم", "تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.");
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

          <View style={styles.card}>
            <Text style={styles.title}>استعادة كلمة المرور</Text>
            <Text style={styles.subtitle}>
              أدخل بريدك وكلمة مرور جديدة لحسابك المسجّل في التطبيق
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
                  textAlign={textAlignStart}
                />
            </View>

            <Text style={styles.label}>كلمة المرور الجديدة</Text>
            <View style={styles.inputWrapper}>
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

            <Text style={styles.label}>تأكيد كلمة المرور</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="********"
                placeholderTextColor={colors.placeholder}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                textAlign={textAlignStart}
              />
            </View>

            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleResetPassword}
            >
              <Text style={styles.resetButtonText}>حفظ كلمة المرور</Text>
            </TouchableOpacity>

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
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    ...rtlText,
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
