import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from "react-native";

export default function SupervisorProfileScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.navigate("SupervisorDashboard")}
          >
            <Text style={styles.headerButton}>رجوع</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.replace("Login")}
          >
            <Text style={styles.headerButton}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </View>

        {/* PROFILE ICON */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarIcon}>🛡️</Text>
          </View>

          <Text style={styles.name}>حسن القادري</Text>

          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>مشرف</Text>
          </View>
        </View>

        {/* PERSONAL INFO */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>المعلومات الشخصية</Text>

          <View style={styles.infoBox}>
            <Text style={styles.label}>الاسم الكامل</Text>
            <Text style={styles.value}>حسن القادري</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>تاريخ الميلاد</Text>
            <Text style={styles.value}>10 يونيو 1985</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.label}>الجنس</Text>
            <Text style={styles.value}>ذكر</Text>
          </View>

          <View style={styles.roleBox}>
            <Text style={styles.label}>الدور</Text>
            <Text style={styles.roleValue}>مشرف</Text>
          </View>
        </View>

        {/* ACCOUNT */}
        <View style={styles.accountCard}>
          <Text style={styles.accountTitle}>الحساب</Text>
          <Text style={styles.accountSubtitle}>إدارة حسابك الإداري</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  container: {
    paddingBottom: 40,
  },

  header: {
    backgroundColor: "#16A34A",
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },

  headerButton: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },

  avatarContainer: {
    alignItems: "center",
    marginTop: 30,
  },

  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarIcon: {
    fontSize: 50,
    color: "white",
  },

  name: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 15,
    textAlign: "center",
  },

  roleBadge: {
    borderWidth: 1,
    borderColor: "#F59E0B",
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 8,
  },

  roleText: {
    color: "#F59E0B",
    fontWeight: "bold",
  },

  card: {
    backgroundColor: "#E6F4EA",
    margin: 20,
    padding: 20,
    borderRadius: 20,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "right",
  },

  infoBox: {
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
    alignItems: "flex-end",
  },

  label: {
    color: "#6B7280",
    marginBottom: 5,
    textAlign: "right",
  },

  value: {
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "right",
  },

  roleBox: {
    backgroundColor: "#FEF3C7",
    padding: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#F59E0B",
    alignItems: "flex-end",
  },

  roleValue: {
    color: "#F59E0B",
    fontWeight: "bold",
    fontSize: 16,
  },

  accountCard: {
    backgroundColor: "#F3E8D9",
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 20,
  },

  accountTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "right",
  },

  accountSubtitle: {
    color: "#6B7280",
    marginTop: 5,
    textAlign: "right",
  },
});