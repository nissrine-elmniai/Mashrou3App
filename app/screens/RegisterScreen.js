// RegisterScreen.js
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

export default function RegisterScreen({ navigation }) {
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleRegister = () => {
    // Validation des champs
    if (
      !nom ||
      !prenom ||
      !dateNaissance ||
      !email ||
      !password ||
      !confirmPassword
    ) {
      Alert.alert("خطأ", "الرجاء ملء جميع الحقول");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("خطأ", "كلمة المرور غير متطابقة");
      return;
    }

    // Logique d'inscription à implémenter
    console.log("Inscription:", {
      nom,
      prenom,
      dateNaissance,
      email,
      password,
    });
    Alert.alert("نجاح", "تم إنشاء الحساب بنجاح");

    // Redirection vers la connexion
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
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Titre */}
          <View style={styles.headerContainer}>
            <Text style={styles.titleMain}>إنشاء حساب جديد</Text>
            <View style={styles.divider} />
          </View>

          {/* Formulaire d'inscription */}
          <View style={styles.formContainer}>
            {/* Nom */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>الاسم</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="أحمد"
                  placeholderTextColor="#9CA3AF"
                  value={nom}
                  onChangeText={setNom}
                  textAlign="right"
                />
              </View>
            </View>

            {/* Prénom */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>اللقب</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="محمد"
                  placeholderTextColor="#9CA3AF"
                  value={prenom}
                  onChangeText={setPrenom}
                  textAlign="right"
                />
              </View>
            </View>

            {/* Date de naissance */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>تاريخ الميلاد</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="2000/01/01"
                  placeholderTextColor="#9CA3AF"
                  value={dateNaissance}
                  onChangeText={setDateNaissance}
                  textAlign="right"
                />
              </View>
            </View>

            {/* Email */}
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

            {/* Mot de passe */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>كلمة المرور</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="********"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  textAlign="right"
                />
              </View>
            </View>

            {/* Confirmer mot de passe */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>تأكيد كلمة المرور</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="********"
                  placeholderTextColor="#9CA3AF"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  textAlign="right"
                />
              </View>
            </View>

            {/* Bouton de création */}
            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleRegister}
            >
              <Text style={styles.registerButtonText}>إنشاء الحساب</Text>
            </TouchableOpacity>

            {/* Lien vers connexion */}
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
    marginTop: Platform.OS === "ios" ? 10 : 5,
  },
  logo: {
    width: 100,
    height: 100,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  titleMain: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#16A34A",
    textAlign: "center",
    marginBottom: 8,
    writingDirection: "rtl",
  },
  divider: {
    width: 80,
    height: 4,
    backgroundColor: "#EAB308",
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
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
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
    paddingVertical: 12,
    fontSize: 15,
    color: "#1F2937",
    textAlign: "right",
    writingDirection: "rtl",
  },
  registerButton: {
    backgroundColor: "#16A34A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  registerButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  loginText: {
    fontSize: 15,
    color: "#6B7280",
    writingDirection: "rtl",
  },
  loginLink: {
    fontSize: 15,
    fontWeight: "600",
    color: "#16A34A",
    marginLeft: 5,
    textDecorationLine: "underline",
    writingDirection: "rtl",
  },
});
