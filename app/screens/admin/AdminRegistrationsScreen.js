import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Clock, Check, X } from "lucide-react-native";
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

const levelColors = {
  مبتدئ: "#FBC02D",
  متوسط: "#1976D2",
  متقدم: "#2E7D32",
};

const members = [
  { name: "أحمد خالد", level: "مبتدئ", session: "جلسة الفجر", progress: 25, status: "نشط" },
  { name: "محمد علي", level: "متوسط", session: "جلسة المغرب", progress: 60, status: "نشط" },
  { name: "عمر حسن", level: "متقدم", session: "جلسة العصر", progress: 85, status: "غير نشط" },
];

const pendingRequests = [
  { name: "سعد محمود", age: 25, level: "مبتدئ", phone: "0501234567" },
  { name: "فهد أحمد", age: 30, level: "متوسط", phone: "0507654321" },
];

export default function AdminRegistrationsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState("all");

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "all" && styles.tabActive]}
          onPress={() => setActiveTab("all")}
        >
          <Text style={[styles.tabText, activeTab === "all" && styles.tabTextActive]}>
            جميع الأعضاء
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "pending" && styles.tabActive]}
          onPress={() => setActiveTab("pending")}
        >
          <Text style={[styles.tabText, activeTab === "pending" && styles.tabTextActive]}>
            قيد الانتظار
          </Text>
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{pendingRequests.length}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
        {activeTab === "all" ? (
          <>
            {members.map((member, index) => {
              const lvlColor = levelColors[member.level] || palette.primary;
              const isActive = member.status === "نشط";
              return (
                <View key={index} style={styles.memberCard}>
                  <View style={styles.memberTop}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>{member.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      <View style={styles.memberMeta}>
                        <View style={[styles.levelBadge, { backgroundColor: lvlColor + "20" }]}>
                          <Text style={[styles.levelText, { color: lvlColor }]}>{member.level}</Text>
                        </View>
                        <Text style={styles.memberSession}>{member.session}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
                      <Text style={[styles.statusText, { color: isActive ? palette.primary : palette.placeholder }]}>
                        {member.status}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.progressRow}>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: member.progress + "%" }]} />
                    </View>
                    <Text style={styles.progressPct}>{member.progress}%</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          <>
            {pendingRequests.map((request, index) => (
              <View key={index} style={styles.pendingCard}>
                <View style={styles.pendingTop}>
                  <View style={styles.pendingIcon}>
                    <Clock size={20} color={palette.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pendingName}>{request.name}</Text>
                    <Text style={styles.pendingMeta}>
                      العمر: {request.age} | {request.level}
                    </Text>
                  </View>
                </View>
                <View style={styles.pendingActions}>
                  <TouchableOpacity style={styles.acceptBtn}>
                    <Check size={16} color="#fff" />
                    <Text style={styles.acceptText}>قبول</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectBtn}>
                    <X size={16} color="#fff" />
                    <Text style={styles.rejectText}>رفض</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  tabRow: {
    flexDirection: row,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: row,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: palette.primary,
  },
  tabText: {
    fontWeight: "500",
    color: palette.textSecondary,
    fontSize: 14,
    ...rtlText,
  },
  tabTextActive: {
    color: palette.primary,
  },
  tabBadge: {
    width: 20,
    height: 20,
    backgroundColor: palette.red,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  tabBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  memberCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  memberTop: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    backgroundColor: palette.softGreen,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 16,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 15,
    ...rtlText,
  },
  memberMeta: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  levelText: {
    fontSize: 12,
  },
  memberSession: {
    color: palette.textSecondary,
    fontSize: 12,
    ...rtlText,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: palette.softGreen,
  },
  statusInactive: {
    backgroundColor: palette.background,
  },
  statusText: {
    fontSize: 12,
  },
  progressRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: palette.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: palette.primary,
    borderRadius: 4,
  },
  progressPct: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  pendingCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pendingTop: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  pendingIcon: {
    width: 40,
    height: 40,
    backgroundColor: "#FFF8E1",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  pendingName: {
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 15,
    ...rtlText,
  },
  pendingMeta: {
    color: palette.textSecondary,
    fontSize: 13,
    marginTop: 2,
    ...rtlText,
  },
  pendingActions: {
    flexDirection: row,
    gap: 8,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    backgroundColor: palette.primary,
    borderRadius: 12,
  },
  acceptText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    backgroundColor: palette.red,
    borderRadius: 12,
  },
  rejectText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});