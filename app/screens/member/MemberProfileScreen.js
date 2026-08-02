import React from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { ROLE_LABELS } from "../../constants/roles";
import { row, arrowBack } from "../../constants/rtl";

export default function MemberProfileScreen({ navigation }) {
  const { currentUser, logout } = useApp();
  const fullName = currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : "";

  const handleLogout = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A8F3C" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.headerAction}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.headerText}>رجوع</Text>
              <Ionicons name={arrowBack} size={20} color="white" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.headerAction} onPress={handleLogout}>
              <Text style={styles.headerText}>تسجيل الخروج</Text>
              <Ionicons name="log-out-outline" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {currentUser?.firstName || "عضو"}
            </Text>
          </View>

          <Text style={styles.userName}>{fullName}</Text>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {ROLE_LABELS[currentUser?.role] || "عضو"}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>المعلومات الشخصية</Text>
              <Text style={styles.cardSub}>معلومات ملفك الشخصي</Text>
            </View>

            <InfoItem
              label="الاسم الكامل"
              value={fullName}
              icon="person-outline"
            />
            <InfoItem
              label="تاريخ الميلاد"
              value={currentUser?.birthDate || "—"}
              icon="calendar-outline"
              yellow
            />
            <InfoItem
              label="الجنس"
              value={currentUser?.gender || "—"}
              icon="person-outline"
            />
            <InfoItem
              label="البريد"
              value={currentUser?.email || "—"}
              icon="mail-outline"
            />
          </View>

          <View style={[styles.card, styles.accountCard]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: "#8A6D00" }]}>
                الحساب
              </Text>
              <Text style={styles.cardSub}>إدارة حسابك</Text>
            </View>

            <ActionButton
              label="تسجيل الخروج"
              color="#D32F2F"
              icon="log-out-outline"
              onPress={handleLogout}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const InfoItem = ({ label, value, icon, yellow }) => (
  <View style={styles.infoBox}>
    <View style={styles.iconWrapper}>
      <Ionicons name={icon} size={20} color={yellow ? "#F4B400" : "#0A8F3C"} />
    </View>

    <View style={styles.infoText}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  </View>
);

const ActionButton = ({ label, color, icon, onPress }) => (
  <TouchableOpacity
    style={[styles.actionBtn, { borderColor: color }]}
    onPress={onPress}
  >
    {icon && (
      <Ionicons name={icon} size={18} color={color} style={{ marginStart: 8 }} />
    )}
    <Text style={[styles.actionText, { color }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7F6" },

  header: {
    backgroundColor: "#0A8F3C",
    height: 200,
    paddingHorizontal: 20,
    justifyContent: "center",
  },

  headerTop: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
  },

  headerAction: {
    flexDirection: row,
    alignItems: "center",
  },

  headerText: {
    color: "white",
    fontWeight: "bold",
    marginHorizontal: 6,
    writingDirection: "rtl",
  },

  profileSection: {
    alignItems: "center",
    marginTop: -40,
    marginBottom: 20,
  },

  avatar: {
    width: 95,
    height: 95,
    borderRadius: 50,
    backgroundColor: "#EAB308",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "white",
    elevation: 6,
  },

  avatarText: {
    color: "white",
    fontSize: 30,
    fontWeight: "bold",
  },

  userName: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 10,
    color: "#004D40",
    writingDirection: "rtl",
  },

  badge: {
    borderWidth: 1,
    borderColor: "#00C853",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginTop: 6,
  },

  badgeText: {
    color: "#00C853",
    fontWeight: "bold",
    fontSize: 12,
    writingDirection: "rtl",
  },

  content: {
    paddingHorizontal: 20,
  },

  card: {
    backgroundColor: "white",
    borderRadius: 20,
    marginBottom: 20,
    overflow: "hidden",
    elevation: 3,
  },

  cardHeader: {
    backgroundColor: "#E8F5E9",
    padding: 15,
    alignItems: "flex-end",
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#0A8F3C",
    writingDirection: "rtl",
  },

  cardSub: {
    fontSize: 13,
    color: "#888",
    marginTop: 3,
    writingDirection: "rtl",
  },

  infoBox: {
    flexDirection: row,
    alignItems: "center",
    backgroundColor: "#F9F9F9",
    margin: 10,
    padding: 12,
    borderRadius: 15,
  },

  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },

  infoText: {
    marginEnd: 12,
    alignItems: "flex-end",
  },

  label: {
    fontSize: 12,
    color: "#999",
    writingDirection: "rtl",
  },

  value: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#222",
    writingDirection: "rtl",
  },

  accountCard: {
    backgroundColor: "#FFFDE7",
  },

  actionBtn: {
    flexDirection: row,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 15,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },

  actionText: {
    fontWeight: "bold",
    fontSize: 14,
    writingDirection: "rtl",
  },
});
