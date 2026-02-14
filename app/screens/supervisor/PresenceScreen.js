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

export default function AttendanceScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton}>
            <Ionicons name="arrow-forward" size={20} color="white" />
            <Text style={styles.backText}>رجوع</Text>
          </TouchableOpacity>

          <View style={styles.headerContent}>
            <Ionicons name="calendar" size={26} color="white" />
            <View style={{ marginRight: 10 }}>
              <Text style={styles.headerTitle}>إدارة الحضور</Text>
              <Text style={styles.headerSubtitle}>
                تسجيل حضور وغياب الأعضاء
              </Text>
            </View>
          </View>
        </View>

        {/* Date Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>التاريخ</Text>
          <View style={styles.dateInput}>
            <Text style={{ color: "#111827" }}>12/02/2026</Text>
            <Ionicons name="calendar-outline" size={18} color="#6B7280" />
          </View>
        </View>

        {/* Stats Cards */}
        <View style={[styles.card, styles.greenBorder]}>
          <Text style={styles.statTitle}>حاضر ✓</Text>
          <Text style={styles.statGreen}>0</Text>
        </View>

        <View style={[styles.card, styles.redBorder]}>
          <Text style={styles.statTitle}>غائب ✕</Text>
          <Text style={styles.statRed}>0</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.statTitle}>غير محدد</Text>
          <Text style={styles.statDefault}>4</Text>
        </View>

        {/* Attendance List */}
        <View style={[styles.card, styles.listCard]}>
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.listTitle}>قائمة الحضور</Text>
              <Text style={styles.listDate}>
                الخميس، 12 فبراير 2026
              </Text>
            </View>

            <TouchableOpacity style={styles.saveButton}>
              <Ionicons name="checkmark" size={18} color="white" />
              <Text style={styles.saveText}>حفظ الحضور</Text>
            </TouchableOpacity>
          </View>

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

          {/* Member Card */}
          {["أمينة", "يوسف", "فاطمة", "محمد"].map((name, index) => (
            <View key={index} style={styles.memberCard}>
              <View style={styles.memberInfo}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {name.charAt(0)}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.memberName}>{name}</Text>
                  <Text style={styles.memberGender}>
                    {index % 2 === 0 ? "أنثى" : "ذكر"}
                  </Text>
                </View>
              </View>

              {/* Buttons */}
              <View style={styles.statusButtons}>
                <TouchableOpacity style={styles.absentBtn}>
                  <Ionicons name="close" size={18} color="#DC2626" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.presentBtn}>
                  <Ionicons name="checkmark" size={18} color="#16A34A" />
                </TouchableOpacity>

                <View style={styles.undefinedBadge}>
                  <Text style={styles.undefinedText}>غير محدد</Text>
                </View>
              </View>
            </View>
          ))}
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

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  backText: {
    color: "white",
    marginLeft: 6,
  },

  headerContent: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },

  headerTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },

  headerSubtitle: {
    color: "white",
    marginTop: 4,
  },

  card: {
    backgroundColor: "white",
    margin: 16,
    padding: 16,
    borderRadius: 16,
    elevation: 2,
  },

  cardLabel: {
    textAlign: "right",
    marginBottom: 10,
    color: "#6B7280",
  },

  dateInput: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    padding: 12,
  },

  greenBorder: {
    borderColor: "#16A34A",
    borderWidth: 1,
  },

  redBorder: {
    borderColor: "#DC2626",
    borderWidth: 1,
  },

  statTitle: {
    textAlign: "right",
    color: "#374151",
  },

  statGreen: {
    textAlign: "right",
    fontSize: 24,
    fontWeight: "bold",
    color: "#16A34A",
  },

  statRed: {
    textAlign: "right",
    fontSize: 24,
    fontWeight: "bold",
    color: "#DC2626",
  },

  statDefault: {
    textAlign: "right",
    fontSize: 24,
    fontWeight: "bold",
  },

  listCard: {
    borderColor: "#16A34A",
    borderWidth: 1,
  },

  listHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  listTitle: {
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "right",
  },

  listDate: {
    color: "#6B7280",
    textAlign: "right",
  },

  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16A34A",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },

  saveText: {
    color: "white",
    marginLeft: 6,
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
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },

  memberInfo: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },

  avatar: {
    width: 45,
    height: 45,
    borderRadius: 22,
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
  },

  memberGender: {
    color: "#6B7280",
  },

  statusButtons: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginTop: 10,
  },

  presentBtn: {
    borderWidth: 1,
    borderColor: "#16A34A",
    borderRadius: 8,
    padding: 6,
    marginLeft: 6,
  },

  absentBtn: {
    borderWidth: 1,
    borderColor: "#DC2626",
    borderRadius: 8,
    padding: 6,
    marginLeft: 6,
  },

  undefinedBadge: {
    borderWidth: 1,
    borderColor: "#9CA3AF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  undefinedText: {
    color: "#374151",
  },
});
