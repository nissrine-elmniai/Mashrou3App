import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Search, Edit, Trash2, Plus } from "lucide-react-native";
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

const supervisors = [
  { name: "أحمد محمد", email: "ahmed@example.com", sessions: 2 },
  { name: "خالد علي", email: "khaled@example.com", sessions: 1 },
  { name: "محمود حسن", email: "mahmoud@example.com", sessions: 3 },
];

export default function AdminSupervisorsScreen({ navigation }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.searchContainer}>
          <Search size={20} color={palette.placeholder} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="بحث..."
            placeholderTextColor={palette.placeholder}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>

        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filter === "all" && styles.filterChipActive]}
            onPress={() => setFilter("all")}
          >
            <Text style={[styles.filterChipText, filter === "all" && styles.filterChipTextActive]}>
              الكل
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filter === "weekdays" && styles.filterChipActive]}
            onPress={() => setFilter("weekdays")}
          >
            <Text style={[styles.filterChipText, filter === "weekdays" && styles.filterChipTextActive]}>
              أيام الأسبوع
            </Text>
          </TouchableOpacity>
        </View>

        {supervisors.map((supervisor, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.cardAvatar}>
              <Text style={styles.cardAvatarText}>
                {supervisor.name.charAt(0)}
              </Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{supervisor.name}</Text>
              <Text style={styles.cardEmail}>{supervisor.email}</Text>
              <View style={styles.sessionBadge}>
                <Text style={styles.sessionBadgeText}>
                  {supervisor.sessions} جلسة
                </Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionBtn}>
                <Edit size={20} color={palette.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#FFEBEE" }]}>
                <Trash2 size={20} color={palette.red} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fab}>
        <Plus size={24} color={palette.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  searchContainer: {
    position: "relative",
    marginBottom: 12,
  },
  searchIcon: {
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 1,
  },
  searchInput: {
    width: "100%",
    paddingRight: 40,
    paddingLeft: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    fontSize: 15,
    color: palette.textPrimary,
    ...rtlText,
  },
  filterRow: {
    flexDirection: row,
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: palette.background,
    borderRadius: 20,
  },
  filterChipActive: {
    backgroundColor: palette.primary,
  },
  filterChipText: {
    fontSize: 14,
    color: palette.textSecondary,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    backgroundColor: palette.softGreen,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  cardAvatarText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 18,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 15,
    ...rtlText,
  },
  cardEmail: {
    color: palette.textSecondary,
    fontSize: 13,
    ...rtlText,
  },
  sessionBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: palette.softGreen,
    borderRadius: 12,
  },
  sessionBadgeText: {
    color: palette.primary,
    fontSize: 12,
  },
  cardActions: {
    flexDirection: row,
    gap: 8,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
  },
  fab: {
    position: "absolute",
    bottom: 20,
    left: 16,
    width: 56,
    height: 56,
    backgroundColor: palette.gold,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
});