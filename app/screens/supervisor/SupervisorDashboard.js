import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function SupervisorDashboard({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.dashboardTitle}>لوحة تحكم المشرف</Text>
              <Text style={styles.supervisorName}>حسن القادري</Text>
            </View>

            <Ionicons name="shield-checkmark" size={28} color="white" />
          </View>

          <TouchableOpacity style={styles.profileButton}>
            <Ionicons name="person-outline" size={18} color="white" />
            <Text style={styles.profileText}>الملف الشخصي</Text>
          </TouchableOpacity>
        </View>

        {/* Main Buttons */}
        <View style={styles.actionsContainer}>
  <TouchableOpacity 
    style={styles.attendanceButton}
    onPress={() => navigation.navigate("Presence")}
  >
    <Ionicons name="calendar-outline" size={20} color="white" />
    <Text style={styles.actionText}>إدارة الحضور</Text>
  </TouchableOpacity>

  <TouchableOpacity 
    style={styles.statsButton}
    onPress={() => navigation.navigate("Statistics")}
  >
    <Ionicons name="trending-up-outline" size={20} color="white" />
    <Text style={styles.actionText}>الإحصائيات</Text>
  </TouchableOpacity>

  <TouchableOpacity 
    style={styles.addButton}
    onPress={() => navigation.navigate("AddMember")} 
  >
    <Ionicons name="person-add-outline" size={20} color="white" />
    <Text style={styles.actionText}>إضافة عضو جديد</Text>
  </TouchableOpacity>
</View>


        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, styles.greenBorder]}>
            <Text style={styles.statLabel}>إجمالي الأعضاء</Text>
            <Text style={styles.statValueGreen}>4</Text>
          </View>

          <View style={[styles.statCard, styles.orangeBorder]}>
            <Text style={styles.statLabel}>إجمالي البرامج</Text>
            <Text style={styles.statValueOrange}>8</Text>
          </View>

          <View style={[styles.statCard, styles.greenBorder]}>
            <Text style={styles.statLabel}>متوسط التقدم</Text>
            <Text style={styles.statValueGreen}>61%</Text>
          </View>
        </View>

        {/* Members Section */}
        <View style={styles.membersContainer}>
          <Text style={styles.membersTitle}>إدارة الأعضاء</Text>
          <Text style={styles.membersSubtitle}>
            قائمة كاملة بالأعضاء المسجلين
          </Text>

          {/* Search */}
          <View style={styles.searchWrapper}>
            <Ionicons name="search-outline" size={18} color="#6B7280" />
            <TextInput
              placeholder="البحث عن عضو..."
              placeholderTextColor="#9CA3AF"
              style={styles.searchInput}
              textAlign="right"
            />
          </View>

          {/* Member Card Example */}
          <View style={styles.memberCard}>
            <View style={styles.memberInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>أب</Text>
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.memberName}>أمينة بنعلي</Text>
                <Text style={styles.memberDetails}>أنثى • 15/03/1995</Text>
              </View>
            </View>

            <View style={styles.badgesContainer}>
              <View style={styles.progressBadge}>
                <Text style={styles.badgeText}>45%</Text>
              </View>

              <View style={styles.programBadge}>
                <Text style={styles.badgeText}>2</Text>
              </View>
            </View>
          </View>

          {/* Duplicate cards later dynamically */}
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

  header: {
    backgroundColor: "#16A34A",
    padding: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  dashboardTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },

  supervisorName: {
    color: "white",
    marginTop: 4,
  },

  profileButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
  },

  profileText: {
    color: "white",
    marginLeft: 6,
  },

  actionsContainer: {
    padding: 20,
  },

  attendanceButton: {
    backgroundColor: "#16A34A",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },

  statsButton: {
    backgroundColor: "#D97706",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },

  addButton: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },

  actionText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 6,
  },

  statsContainer: {
    paddingHorizontal: 20,
  },

  statCard: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
    elevation: 2,
      alignItems: "flex-end", // 👈 AJOUTE ÇA

  },

  greenBorder: {
    borderColor: "#16A34A",
    borderWidth: 1,
  },

  orangeBorder: {
    borderColor: "#D97706",
    borderWidth: 1,
  },

  statLabel: {
    textAlign: "right",
    color: "#6B7280",
  },

  statValueGreen: {
    textAlign: "right",
    fontSize: 24,
    fontWeight: "bold",
    color: "#16A34A",
  },

  statValueOrange: {
    textAlign: "right",
    fontSize: 24,
    fontWeight: "bold",
    color: "#D97706",
  },

  membersContainer: {
    padding: 20,
  },

  membersTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "right",
  },

  membersSubtitle: {
    color: "#6B7280",
    textAlign: "right",
    marginBottom: 12,
  },

  searchWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 15,
  },

  searchInput: {
    flex: 1,
    paddingVertical: 10,
  },

  memberCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
    elevation: 2,
  },

  memberInfo: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    color: "white",
    fontWeight: "bold",
  },

  memberName: {
    fontWeight: "bold",
    fontSize: 16,
  },

  memberDetails: {
    color: "#6B7280",
    marginTop: 4,
  },

  badgesContainer: {
    flexDirection: "row-reverse",
    marginTop: 10,
  },

  progressBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 8,
  },

  programBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },

  badgeText: {
    fontWeight: "bold",
  },
});
