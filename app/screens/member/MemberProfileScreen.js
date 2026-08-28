import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Switch,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { ROLE_LABELS, SEASON_TYPES } from "../../constants/roles";
import { colors, radii, shadows } from "../../constants/theme";
import { row, arrowBack, rtlText, fonts } from "../../constants/rtl";
import { EmptyState, StatChip } from "../../components/ui";
import ChangePasswordModal from "../../components/ChangePasswordModal";

export default function MemberProfileScreen({ navigation }) {
  const { currentUser, logout, seasons, exams, getMemberProgress } = useApp();
  const fullName = currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : "";

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [passwordModal, setPasswordModal] = useState(false);
  const insets = useSafeAreaInsets();

  const activeSeason =
    seasons.find((s) => s.active && s.type === SEASON_TYPES.REGULAR) ||
    seasons.find((s) => s.type === SEASON_TYPES.REGULAR) ||
    seasons[0];

  const myProgress = getMemberProgress(currentUser?.id, activeSeason?.id);
  const myExams = exams.filter((e) => e.memberId === currentUser?.id);
  const totalAhzab = myProgress
    ? Math.round((myProgress.hifzPages || 0) / 20)
    : 0;

  const handleLogout = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.gradientHeader[0]}
      />
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={colors.gradientHeader} style={styles.header}>
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
        </LinearGradient>

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

          {myProgress ? (
            <View style={styles.chipsRow}>
              <StatChip
                icon="book-outline"
                label="صفحات الحفظ"
                value={myProgress.hifzPages || 0}
                color={colors.primary}
              />
              <StatChip
                icon="layers-outline"
                label="أحزاب"
                value={totalAhzab}
                color={colors.gold}
              />
              {myProgress.reviewPages ? (
                <StatChip
                  icon="refresh-outline"
                  label="مراجعة"
                  value={myProgress.reviewPages}
                  color={colors.orange}
                />
              ) : null}
            </View>
          ) : null}
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
              label="البريد"
              value={currentUser?.email || "—"}
              icon="mail-outline"
            />
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>سجل الاختبارات</Text>
              <Text style={styles.cardSub}>نتائجك المسجلة في التقييمات</Text>
            </View>

            {myExams.length === 0 ? (
              <EmptyState text="لا توجد اختبارات مسجلة بعد" />
            ) : (
              myExams.map((e) => (
                <View key={e.id} style={styles.examRow}>
                  <View style={styles.examInfo}>
                    <Text style={styles.examLevel}>{e.level || e.title}</Text>
                    <Text style={styles.examDate}>{e.date}</Text>
                  </View>
                  <View style={styles.scorePill}>
                    <Text style={styles.scoreText}>{e.score}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>الإشعارات</Text>
              <Text style={styles.cardSub}>استلام التنبيهات والتحديثات</Text>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>تفعيل الإشعارات</Text>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="white"
              />
            </View>
          </View>

          <View style={[styles.card, styles.accountCard]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>الحساب</Text>
              <Text style={styles.cardSub}>إدارة حسابك</Text>
            </View>

            <ActionButton
              label="تغيير كلمة المرور"
              color={colors.primary}
              icon="lock-closed-outline"
              onPress={() => setPasswordModal(true)}
            />
            <ActionButton
              label="تسجيل الخروج"
              color={colors.red}
              icon="log-out-outline"
              onPress={handleLogout}
            />
          </View>
        </View>
      </ScrollView>

      <ChangePasswordModal
        visible={passwordModal}
        onClose={() => setPasswordModal(false)}
        bottomInset={Math.max(insets.bottom, 16)}
      />
    </SafeAreaView>
  );
}

const InfoItem = ({ label, value, icon, yellow }) => (
  <View style={styles.infoBox}>
    <View style={styles.iconWrapper}>
      <Ionicons
        name={icon}
        size={20}
        color={yellow ? colors.gold : colors.primary}
      />
    </View>

    <View style={styles.infoContent}>
      <Text style={styles.inlineLabel}>{label}</Text>
      <Text style={styles.inlineValue}>{value}</Text>
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
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "white",
    ...shadows.card,
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
    color: colors.primaryDark,
    ...rtlText,
  },

  badge: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 3,
    marginTop: 6,
  },

  badgeText: {
    color: colors.primary,
    fontWeight: "bold",
    fontSize: 12,
    ...rtlText,
  },

  chipsRow: {
    flexDirection: row,
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 20,
  },

  content: {
    paddingHorizontal: 20,
  },

  card: {
    backgroundColor: "white",
    borderRadius: radii.lg,
    marginBottom: 20,
    overflow: "hidden",
    ...shadows.card,
  },

  cardHeader: {
    backgroundColor: colors.soft,
    padding: 15,
    alignItems: "flex-end",
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: colors.primary,
    ...rtlText,
  },

  cardSub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 3,
    ...rtlText,
  },

  infoBox: {
    flexDirection: row,
    alignItems: "center",
    backgroundColor: "#F9F9F9",
    margin: 10,
    padding: 12,
    borderRadius: radii.md,
  },

  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.soft,
    justifyContent: "center",
    alignItems: "center",
  },

  infoContent: {
    flex: 1,
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    marginStart: 12,
  },

  inlineLabel: {
    fontSize: 12,
    color: colors.muted,
    textAlign: "right",
    writingDirection: "rtl",
  },

  inlineValue: {
    fontSize: 15,
    fontWeight: "bold",
    color: colors.text,
    textAlign: "left",
    writingDirection: "rtl",
  },

  examRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9F9F9",
    margin: 10,
    padding: 12,
    borderRadius: radii.md,
  },

  examInfo: {
    alignItems: "flex-end",
  },

  examLevel: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.text,
    ...rtlText,
  },

  examDate: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    ...rtlText,
  },

  scorePill: {
    minWidth: 44,
    alignItems: "center",
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },

  scoreText: {
    fontSize: 15,
    fontWeight: "bold",
    color: colors.primary,
    ...rtlText,
  },

  switchRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9F9F9",
    margin: 10,
    padding: 12,
    borderRadius: radii.md,
  },

  switchLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    ...rtlText,
  },

  accountCard: {
    backgroundColor: "#FFFDE7",
  },

  actionBtn: {
    flexDirection: row,
    borderWidth: 1,
    borderRadius: radii.md,
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
    ...rtlText,
  },
});