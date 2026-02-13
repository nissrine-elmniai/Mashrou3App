// app/screens/member/ProfileScreen.js
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";

export default function ProfileScreen({ navigation }) {
  // Données du membre
  const [membre] = useState({
    prenom: "أمينة",
    nom: "بنعلي",
    dateNaissance: "15 مارس 1995",
    genre: "أنثى",
  });

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل أنت متأكد من تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تسجيل الخروج",
        style: "destructive",
        onPress: () => navigation.replace("Login"),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* ========== EN-TÊTE VERT ========== */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={styles.headerBack}>رجوع</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} activeOpacity={0.7}>
              <Text style={styles.headerLogout}>تسجيل الخروج</Text>
            </TouchableOpacity>
          </View>

          {/* Avatar avec initiales */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{membre.prenom}</Text>
            </View>
          </View>

          {/* Nom de l'utilisateur */}
          <Text style={styles.userName}>
            {membre.prenom} {membre.nom}
          </Text>

          {/* Badge عضو */}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>عضو</Text>
          </View>
        </View>

        {/* ========== SECTION 1 : المعلومات الشخصية ========== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>المعلومات الشخصية</Text>
          <Text style={styles.sectionSubtitle}>معلومات ملفك الشخصي</Text>

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>الاسم الكامل</Text>
            <Text style={styles.infoValue}>
              {membre.prenom} {membre.nom}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>تاريخ الميلاد</Text>
            <Text style={styles.infoValue}>{membre.dateNaissance}</Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>الجنس</Text>
            <Text style={styles.infoValue}>{membre.genre}</Text>
          </View>
        </View>

        {/* ========== SECTION 2 : الحساب ========== */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الحساب</Text>
          <Text style={styles.sectionSubtitle}>إدارة حسابك</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <Text style={styles.menuText}>تعديل الملف الشخصي</Text>
            <Text style={styles.menuArrow}>←</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("ChangePassword")}
          >
            <Text style={styles.menuText}>تغيير كلمة المرور</Text>
            <Text style={styles.menuArrow}>←</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <Text style={styles.logoutText}>تسجيل الخروج</Text>
            <Text style={styles.menuArrow}>←</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F9FAFB", // MÊME GRIS que Dashboard
  },
  container: {
    flex: 1,
  },
  // ========== HEADER VERT (MÊME QUE DASHBOARD) ==========
  header: {
    backgroundColor: "#16A34A",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 40,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerLogout: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "500",
    writingDirection: "rtl",
  },
  headerBack: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "500",
    writingDirection: "rtl",
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 85,
    height: 85,
    borderRadius: 42.5,
    backgroundColor: "#EAB308", // ✅ JAUNE EXACT des autres screens
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3, // ✅ BORDURE BLANCHE comme Dashboard
    borderColor: "#FFFFFF",
  },
  avatarText: {
    fontSize: 34,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  userName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 10,
    writingDirection: "rtl",
  },
  badge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    writingDirection: "rtl",
  },
  // ========== SECTIONS BLANCHES (COMME DASHBOARD) ==========
  section: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 16, // ✅ MÊME ARRONDI que Dashboard
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1F2937", // ✅ MÊME GRIS FONCÉ que Dashboard
    writingDirection: "rtl",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#6B7280", // ✅ MÊME GRIS que Dashboard
    writingDirection: "rtl",
    marginBottom: 16,
  },
  // ========== STYLES INFORMATIONS ==========
  infoBlock: {
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: "#6B7280", // ✅ MÊME GRIS que Dashboard
    writingDirection: "rtl",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937", // ✅ MÊME GRIS FONCÉ que Dashboard
    writingDirection: "rtl",
  },
  separator: {
    height: 1,
    backgroundColor: "#F3F4F6", // ✅ MÊME GRIS que Dashboard
  },
  // ========== STYLES MENU ==========
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
  },
  menuText: {
    fontSize: 16,
    color: "#374151", // ✅ MÊME GRIS que Dashboard
    writingDirection: "rtl",
  },
  logoutText: {
    fontSize: 16,
    color: "#EF4444", // ✅ ROUGE EXACT des autres screens
    fontWeight: "500",
    writingDirection: "rtl",
  },
  menuArrow: {
    fontSize: 18,
    color: "#9CA3AF", // ✅ MÊME GRIS que Dashboard
  },
});
