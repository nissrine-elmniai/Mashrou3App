import React, { useState } from "react";
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
import { colors, radii, shadows } from "../constants/theme";
import { supabase, mapSupabaseAuthError } from "../lib/supabase";
import { row } from "../constants/rtl";

/**
 * Écran atteint via le lien "mot de passe oublié" reçu par e-mail
 * (deep link mashrou3app://reset-password géré dans App.js). Une session
 * de récupération Supabase est déjà active à ce stade.
 */
export default function ResetPasswordScreen({ navigation }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const backToLogin = async () => {
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const handleSave = async () => {
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
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      Alert.alert("خطأ", mapSupabaseAuthError(error));
      return;
    }

    // On force une reconnexion propre avec le nouveau mot de passe plutôt
    // que de laisser l'utilisateur connecté via la session de récupération.
    await supabase.auth.signOut();
    Alert.alert("تم", "تم تحديث كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.");
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
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

          <View style={styles.card}>
            <Text style={styles.title}>تعيين كلمة مرور جديدة</Text>
            <Text style={styles.subtitle}>
              أدخل كلمة مرور جديدة لحسابك ثم أكّدها
            </Text>
            <View style={styles.divider} />

            <Text style={styles.label}>كلمة المرور الجديدة</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={styles.passwordInput}
                placeholder="********"
                placeholderTextColor={colors.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                textAlign="right"
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
                textAlign="right"
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

            <TouchableOpacity
              style={[styles.resetButton, submitting && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={submitting}
            >
              <Text style={styles.resetButtonText}>
                {submitting ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={backToLogin}>
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
    textAlign: "right",
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
    textAlign: "right",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    textAlign: "right",
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
