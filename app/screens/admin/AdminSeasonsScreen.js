import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { rtlText } from "../../constants/rtl";

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
  { name: "حصة الفجر", day: "السبت - الاثنين - الأربعاء", time: "5:30 ص", supervisors: 2, members: 12 },
  { name: "حصة العصر", day: "الأحد - الثلاثاء - الخميس", time: "4:00 م", supervisors: 1, members: 8 },
  { name: "حصة المغرب", day: "يومياً", time: "6:30 م", supervisors: 3, members: 15 },
];

export default function AdminSeasonsScreen({ navigation }) {
  return (
    <SafeAreaView style={[styles.container, { paddingBottom: 16 }]} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
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
    flexDirection: "row",
    gap: 12,
  },
  badgeSupervisor: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: palette.softGreen,
    borderRadius: 12,
  },
  badgeSupervisorText: {
    color: palette.primary,
    fontSize: 12,
  },
  badgeMember: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#E3F2FD",
    borderRadius: 12,
  },
  badgeMemberText: {
    color: palette.blue,
    fontSize: 12,
  },
});