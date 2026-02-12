// LoginScreen.js
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
} from "react-native";
import { StatusBar } from "expo-status-bar";

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    // Logique d'authentification à implémenter
    console.log("Login attempt:", { username, password });
    // Navigation vers le dashboard
    // navigation.navigate('Main');
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
          {/* Logo / Titre principal */}
          <View style={styles.headerContainer}>
            <Text style={styles.titleMain}>مهندس حامل لكتاب الله</Text>
            <Text style={styles.subtitleMain}>
              تطبيق متابعة حفظ القرآن الكريم
            </Text>
            <View style={styles.divider} />
          </View>

          {/* Formulaire de connexion */}
          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>البريد الالكتروني </Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="quran@gmail.com"
                  placeholderTextColor="#9CA3AF"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>كلمة المرور</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="*********"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  textAlign="right"
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => navigation.navigate("Dashboard")}
            >
              <Text style={styles.loginButtonText}>تسجيل الدخول</Text>
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
                  <Text style={styles.signupLink}>إنشاء حساب جديد</Text>
                </TouchableOpacity>
                <Text style={styles.signupText}>ليس لديك حساب؟ </Text>
              </View>
            </View>
          </View>
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
    marginTop: Platform.OS === "ios" ? 10 : 20,
  },
  logo: {
    width: 200,
    height: 200,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  titleMain: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#16A34A", // Vert principal
    textAlign: "center",
    marginBottom: 8,
    writingDirection: "rtl",
  },
  subtitleMain: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16,
    writingDirection: "rtl",
  },
  divider: {
    width: 80,
    height: 4,
    backgroundColor: "#EAB308", // Jaune
    borderRadius: 2,
    marginTop: 8,
  },
  formContainer: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    textAlign: "right",
    writingDirection: "rtl",
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1F2937",
    textAlign: "right",
    writingDirection: "rtl",
  },
  loginButton: {
    backgroundColor: "#16A34A", // Vert
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  loginButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  badgeText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  signupContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 10,
  },
  signupText: {
    fontSize: 15,
    color: "#6B7280",
    writingDirection: "rtl",
  },
  signupLink: {
    fontSize: 15,
    fontWeight: "600",
    color: "#16A34A", // Vert principal
    marginLeft: 5,
    textDecorationLine: "underline",
    writingDirection: "rtl",
  },
  linksContainer: {
    marginTop: 24,
    alignItems: "center",
    width: "100%",
  },
  forgotPasswordLink: {
    fontSize: 15,
    color: "#EAB308", // Jaune pour correspondre au thème
    textAlign: "center",
    marginBottom: 12,
    textDecorationLine: "underline",
    writingDirection: "rtl",
    fontWeight: "500",
  },
  separator: {
    height: 1,
    width: "60%",
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
    alignSelf: "center",
  },
});
