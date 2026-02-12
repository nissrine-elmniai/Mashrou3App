// ForgotPasswordScreen.js
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

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("");

  const handleResetPassword = () => {
    if (!email) {
      Alert.alert("خطأ", "الرجاء إدخال البريد الإلكتروني");
      return;
    }

    // Logique d'envoi d'email de réinitialisation
    console.log("Demande de réinitialisation:", email);
    Alert.alert(
      "✅ تم الإرسال",
      "إذا كان البريد الإلكتروني موجودًا في نظامنا، ستتلقى رابط إعادة تعيين كلمة المرور",
    );

    // Redirection vers la connexion après quelques secondes
    setTimeout(() => {
      navigation.navigate("Login");
    }, 2000);
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
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* 🆕 CARTE DE RÉINITIALISATION */}
          <View style={styles.card}>
            {/* Icône de cadenas (optionnel) */}
            <View style={styles.iconContainer}>
              <Text style={styles.lockIcon}>🔐</Text>
            </View>

            {/* Titre */}
            <Text style={styles.title}>استعادة كلمة المرور</Text>

            {/* Sous-titre */}
            <Text style={styles.subtitle}>
              أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور
            </Text>

            {/* Séparateur */}
            <View style={styles.divider} />

            {/* Formulaire */}
            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>البريد الإلكتروني</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="quran@gmail.com"
                    placeholderTextColor="#9CA3AF"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    textAlign="right"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleResetPassword}
                activeOpacity={0.8}
              >
                <Text style={styles.resetButtonText}>إرسال رابط الاستعادة</Text>
              </TouchableOpacity>

              <View style={styles.separatorContainer}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>أو</Text>
                <View style={styles.separatorLine} />
              </View>

              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.backButtonText}>
                  ← العودة إلى تسجيل الدخول
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Note de bas de page */}
          <Text style={styles.footerNote}>
            سيتم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 20 : 40,
    paddingBottom: 30,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    marginTop: Platform.OS === "ios" ? 10 : 20,
  },
  logo: {
    width: 100,
    height: 100,
  },

  // 🆕 STYLES DE LA CARTE
  card: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  lockIcon: {
    fontSize: 48,
    color: "#16A34A",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#16A34A",
    textAlign: "center",
    marginBottom: 12,
    writingDirection: "rtl",
  },
  subtitle: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
    writingDirection: "rtl",
    lineHeight: 22,
    paddingHorizontal: 10,
  },
  divider: {
    width: 60,
    height: 3,
    backgroundColor: "#EAB308",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 24,
  },
  formContainer: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    textAlign: "right",
    writingDirection: "rtl",
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    overflow: "hidden",
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1F2937",
    textAlign: "right",
    writingDirection: "rtl",
  },
  resetButton: {
    backgroundColor: "#16A34A",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  resetButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  separatorContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  separatorText: {
    marginHorizontal: 12,
    color: "#9CA3AF",
    fontSize: 14,
  },
  backButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#EAB308",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    writingDirection: "rtl",
  },
  footerNote: {
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 10,
    writingDirection: "rtl",
  },
});
