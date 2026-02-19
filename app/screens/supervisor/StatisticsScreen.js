import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";

export default function SupervisorStatisticsScreen() {
  return (
    <ScrollView style={styles.container}>
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.back}>رجوع →</Text>
        <Text style={styles.title}>الإحصائيات</Text>
        <Text style={styles.subtitle}>
          نظرة شاملة على الأداء والحضور
        </Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>إجمالي الأعضاء</Text>
        <Text style={styles.cardNumber}>4</Text>
      </View>

      <View style={[styles.card, { borderColor: "#F4B400" }]}>
        <Text style={styles.cardTitle}>إجمالي البرامج</Text>
        <Text style={[styles.cardNumber, { color: "#F4B400" }]}>8</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>متوسط التقدم</Text>
        <Text style={[styles.cardNumber, { color: "green" }]}>61%</Text>
      </View>

      <View style={[styles.card, { borderColor: "#4285F4" }]}>
        <Text style={styles.cardTitle}>معدل الحضور</Text>
        <Text style={[styles.cardNumber, { color: "#4285F4" }]}>0%</Text>
      </View>

      {/* Top Members */}
      <View style={styles.topContainer}>
        <Text style={styles.topTitle}>الأعضاء المتميزون</Text>
        <Text style={styles.topSubtitle}>
          أفضل 5 أعضاء من حيث التقدم في الحفظ
        </Text>

        {[
          { name: "محمد الشكري", progress: 90, rank: 1 },
          { name: "يوسف العلمي", progress: 78, rank: 2 },
          { name: "أمينة بنعلي", progress: 45, rank: 3 },
          { name: "فاطمة المنصوري", progress: 30, rank: 4 },
        ].map((member) => (
          <View key={member.rank} style={styles.memberCard}>
            <View>
              <Text style={styles.memberName}>{member.name}</Text>
              <Text style={styles.program}>2 برامج</Text>

              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${member.progress}%` },
                  ]}
                />
              </View>

              <Text style={styles.progressText}>
                التقدم {member.progress}%
              </Text>
            </View>

            <View style={styles.rankCircle}>
              <Text style={styles.rankText}>{member.rank}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f4f4",
  },

  header: {
    backgroundColor: "#0A8F3C",
    padding: 20,
    paddingTop: 50,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },

  back: {
    color: "white",
    fontSize: 14,
    marginBottom: 10,
  },

  title: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
  },

  subtitle: {
    color: "white",
    marginTop: 5,
  },

  card: {
    backgroundColor: "white",
    margin: 15,
    padding: 20,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#ddd",
    elevation: 3,
  },

  cardTitle: {
    fontSize: 16,
    color: "#555",
  },

  cardNumber: {
    fontSize: 24,
    fontWeight: "bold",
    marginTop: 5,
  },

  topContainer: {
    margin: 15,
    padding: 15,
    backgroundColor: "#E8F5E9",
    borderRadius: 15,
  },

  topTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "green",
  },

  topSubtitle: {
    marginBottom: 15,
    color: "#555",
  },

  memberCard: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  memberName: {
    fontSize: 16,
    fontWeight: "bold",
  },

  program: {
    fontSize: 12,
    color: "#888",
    marginVertical: 5,
  },

  progressBarBackground: {
    height: 8,
    width: 150,
    backgroundColor: "#ddd",
    borderRadius: 10,
  },

  progressBarFill: {
    height: 8,
    backgroundColor: "green",
    borderRadius: 10,
  },

  progressText: {
    fontSize: 12,
    marginTop: 5,
  },

  rankCircle: {
    backgroundColor: "#F4B400",
    width: 35,
    height: 35,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  rankText: {
    color: "white",
    fontWeight: "bold",
  },
});
