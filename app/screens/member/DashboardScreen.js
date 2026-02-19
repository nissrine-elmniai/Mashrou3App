import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function SupervisorDashboard() {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.welcome}>مرحباً، المشرف 👋</Text>
          <Text style={styles.subtitle}>لوحة تحكم المشرف</Text>
        </View>

        {/* Cards */}
        <View style={styles.cardsContainer}>

          <TouchableOpacity style={styles.card}>
            <Ionicons name="people-outline" size={30} color="#16A34A" />
            <Text style={styles.cardText}>إدارة الأعضاء</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card}>
            <Ionicons name="clipboard-outline" size={30} color="#16A34A" />
            <Text style={styles.cardText}>إدارة البرامج</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card}>
            <Ionicons name="stats-chart-outline" size={30} color="#16A34A" />
            <Text style={styles.cardText}>الإحصائيات</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card}>
            <Ionicons name="settings-outline" size={30} color="#16A34A" />
            <Text style={styles.cardText}>الإعدادات</Text>
          </TouchableOpacity>

        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },

  header: {
    backgroundColor: "#16A34A",
    paddingHorizontal: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },

  welcome: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "right",
  },

  subtitle: {
    color: "white",
    fontSize: 16,
    marginTop: 5,
    textAlign: "right",
  },

  cardsContainer: {
    padding: 20,
  },

  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 15,
    marginBottom: 15,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "flex-start",
    elevation: 3,
  },

  cardText: {
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 15,
  },
});
