import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { rtlText, row } from "../../constants/rtl";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  blue: "#1976D2",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
};

const sessions = [
  {
    name: "حصة الفجر",
    day: "السبت - الاثنين - الأربعاء",
    time: "5:30 ص",
    supervisors: 2,
    members: 12,
  },
  {
    name: "حصة العصر",
    day: "الأحد - الثلاثاء - الخميس",
    time: "4:00 م",
    supervisors: 1,
    members: 8,
  },
  {
    name: "حصة المغرب",
    day: "يومياً",
    time: "6:30 م",
    supervisors: 3,
    members: 15,
  },
];

export default function AdminSeasonsScreen({ navigation }) {
  const { currentUser, stats } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>الحصص</Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="الملف الشخصي"
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="التنبيهات"
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
          {pendingCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {pendingCount > 9 ? "9+" : pendingCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + bottomGap },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {sessions.map((session, index) => (
          <View key={index} style={styles.card}>
            <Text style={styles.cardTitle}>{session.name}</Text>
            <Text style={styles.cardDay}>{session.day}</Text>
            <Text style={styles.cardTime}>{session.time}</Text>
            <View style={styles.badgesRow}>
              <View style={styles.badgeSupervisor}>
                <Text style={styles.badgeSupervisorText}>
                  👨‍🏫 {session.supervisors} مشرف
                </Text>
              </View>
              <View style={styles.badgeMember}>
                <Text style={styles.badgeMemberText}>
                  👥 {session.members} عضو
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  topBar: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  topBarTitle: {
    flex: 1,
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    ...rtlText,
  },
  topBarAvatar: {
    width: 32,
    height: 32,
    backgroundColor: palette.softGreen,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarAvatarText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 14,
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    end: -6,
    backgroundColor: palette.red,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderRightWidth: 4,
    borderRightColor: palette.primary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    marginBottom: 4,
    ...rtlText,
  },
  cardDay: {
    color: palette.textSecondary,
    fontSize: 14,
    marginBottom: 8,
    ...rtlText,
  },
  cardTime: {
    color: palette.primary,
    fontWeight: "600",
    fontSize: 15,
    marginBottom: 12,
    ...rtlText,
  },
  badgesRow: {
    flexDirection: row,
    gap: 8,
  },
  badgeSupervisor: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: palette.softGreen,
    borderRadius: 12,
  },
  badgeSupervisorText: {
    color: palette.primary,
    fontSize: 12,
    ...rtlText,
  },
  badgeMember: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#E3F2FD",
    borderRadius: 12,
  },
  badgeMemberText: {
    color: palette.blue,
    fontSize: 12,
    ...rtlText,
  },
});
