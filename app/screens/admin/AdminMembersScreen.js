import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Menu, Bell, Clock, Check, X } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import {
  ACCOUNT_STATUS,
  REGISTRATION_STATUS,
  ROLES,
  userHasRole,
} from "../../constants/roles";
import { rtlText, row } from "../../constants/rtl";
import {
  LEVEL_COLORS,
  deriveLevel,
  initials,
} from "../supervisor/supervisorHelpers";
import { sendMemberAcceptEmail } from "../../utils/sendInviteEmail";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  softGold: "#FFF8E1",
  blue: "#1976D2",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
  inactive: "#9E9E9E",
};

function sessionLabel(group) {
  if (!group) return "بدون حصة";
  const slot = group.freeTimeSlot || "";
  if (slot.includes("فجر")) return "حصة الفجر";
  if (slot.includes("ظهر")) return "حصة الظهر";
  if (slot.includes("عصر")) return "حصة العصر";
  if (slot.includes("مغرب")) return "حصة المغرب";
  if (slot.includes("سبت")) return "حصة السبت";
  if (slot.includes("أحد")) return "حصة الأحد";
  return group.name || slot || "حصة";
}

function levelColor(level) {
  return LEVEL_COLORS[level] || palette.primary;
}

function computeAge(birthDate) {
  if (!birthDate) return null;
  const parts = String(birthDate).split(/[/-]/).map(Number);
  if (parts.length < 3 || parts.some((n) => !n)) return null;
  // Formats possibles: YYYY/MM/DD ou DD/MM/YYYY
  let year;
  let month;
  let day;
  if (parts[0] > 31) {
    [year, month, day] = parts;
  } else if (parts[2] > 31) {
    [day, month, year] = parts;
  } else {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - year;
  if (
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day)
  ) {
    age -= 1;
  }
  return age >= 0 && age < 120 ? age : null;
}

export default function AdminMembersScreen({ navigation }) {
  const {
    users,
    groups,
    progress,
    registrations,
    stats,
    currentUser,
    getMemberGroup,
    getMemberProgress,
    reviewRegistration,
  } = useApp();
  const [tab, setTab] = useState(() =>
    (stats?.pendingRegs ?? 0) > 0 ? "pending" : "all"
  );
  const [sendingId, setSendingId] = useState(null);

  const pendingRegs = useMemo(
    () =>
      registrations
        .filter((r) => r.status === REGISTRATION_STATUS.PENDING)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [registrations]
  );

  const acceptAndInvite = async (reg) => {
    if (!reg.email) {
      Alert.alert(
        "تنبيه",
        "لا يوجد بريد إلكتروني لهذا الطلب. لا يمكن إرسال الدعوة."
      );
      return;
    }

    const result = reviewRegistration(reg.id, REGISTRATION_STATUS.ACCEPTED);
    if (!result?.ok) {
      Alert.alert("خطأ", result?.error || "تعذر قبول الطلب");
      return;
    }

    setSendingId(reg.id);
    const mail = await sendMemberAcceptEmail({
      toEmail: reg.email,
      fullName: reg.fullName,
    });
    setSendingId(null);

    if (mail.ok) {
      Alert.alert(
        "تم القبول",
        `تم قبول الطلب وإرسال الرسالة إلى:\n${reg.email}`
      );
    } else {
      Alert.alert(
        "تم القبول — فشل إرسال البريد",
        `${mail.error || ""}\n\nأبلغ المترشح أنه يمكنه إنشاء حسابه من التطبيق بنفس البريد.`
      );
    }
  };

  const rejectRegistration = (reg) => {
    Alert.alert("تأكيد الرفض", `هل تريد رفض طلب ${reg.fullName}؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "رفض",
        style: "destructive",
        onPress: () => {
          reviewRegistration(reg.id, REGISTRATION_STATUS.REJECTED);
        },
      },
    ]);
  };

  const members = useMemo(() => {
    return users
      .filter(
        (u) =>
          userHasRole(u, ROLES.MEMBER) &&
          u.accountStatus !== ACCOUNT_STATUS.INVITED
      )
      .map((user) => {
        const group = getMemberGroup(user.id);
        const prog = getMemberProgress(user.id);
        const pct = prog
          ? Math.min(
              100,
              Math.round(
                ((prog.hifzPages || 0) / (prog.targetPages || 1)) * 100
              )
            )
          : 0;
        const level =
          user.level && LEVEL_COLORS[user.level]
            ? user.level
            : deriveLevel(pct);
        const active =
          user.accountStatus !== ACCOUNT_STATUS.INVITED && !!group;
        return {
          id: user.id,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          firstName: user.firstName || "",
          level,
          pct,
          session: sessionLabel(group),
          active,
        };
      });
  }, [users, groups, progress, getMemberGroup, getMemberProgress]);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? pendingRegs.length;

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: 16 }]} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>الأعضاء</Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
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

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "all" && styles.tabActive]}
          onPress={() => setTab("all")}
        >
          <Text style={[styles.tabText, tab === "all" && styles.tabTextActive]}>
            جميع الأعضاء
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "pending" && styles.tabActive]}
          onPress={() => setTab("pending")}
        >
          <View style={styles.tabPendingRow}>
            <Text
              style={[
                styles.tabText,
                tab === "pending" && styles.tabTextActive,
              ]}
            >
              قيد الانتظار
            </Text>
            {pendingCount > 0 ? (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{pendingCount}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === "all" ? (
          members.length === 0 ? (
            <Text style={styles.emptyText}>لا يوجد أعضاء بعد</Text>
          ) : (
            members.map((member) => (
              <MemberCard key={member.id} member={member} />
            ))
          )
        ) : pendingRegs.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد طلبات قيد الانتظار</Text>
        ) : (
          pendingRegs.map((reg) => (
            <PendingCard
              key={reg.id}
              reg={reg}
              sending={sendingId === reg.id}
              onAccept={() => acceptAndInvite(reg)}
              onReject={() => rejectRegistration(reg)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MemberCard({ member }) {
  const color = levelColor(member.level);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardAvatar}>
          <Text style={styles.cardAvatarText}>
            {initials(member.firstName || member.name)}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{member.name || "عضو"}</Text>
          <View style={styles.cardMeta}>
            <View style={[styles.levelPill, { backgroundColor: `${color}22` }]}>
              <Text style={[styles.levelPillText, { color }]}>
                {member.level}
              </Text>
            </View>
            <Text style={styles.sessionText}>{member.session}</Text>
          </View>
        </View>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: member.active
                ? palette.softGreen
                : "#EEEEEE",
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: member.active ? palette.primary : palette.inactive,
              },
            ]}
          >
            {member.active ? "نشط" : "غير نشط"}
          </Text>
        </View>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${member.pct}%` },
            ]}
          />
        </View>
        <Text style={styles.progressPct}>{member.pct}%</Text>
      </View>
    </View>
  );
}

function PendingCard({ reg, sending, onAccept, onReject }) {
  const name = reg.fullName || "مترشح";
  const level = reg.level || "مبتدئ";
  const age = computeAge(reg.birthDate);
  const detail =
    age != null
      ? `العمر: ${age} | ${level}`
      : reg.school
        ? `${reg.school} | ${level}`
        : `المستوى: ${level}`;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.clockWrap}>
          <Clock size={22} color={palette.gold} pointerEvents="none" />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{name}</Text>
          <Text style={styles.pendingDetail}>{detail}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.acceptBtn]}
          onPress={sending ? undefined : onAccept}
          activeOpacity={0.75}
          disabled={!!sending}
        >
          <Check size={18} color="#fff" pointerEvents="none" />
          <Text style={styles.actionBtnText}>
            {sending ? "جاري..." : "قبول"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.rejectBtn]}
          onPress={sending ? undefined : onReject}
          activeOpacity={0.75}
          disabled={!!sending}
        >
          <X size={18} color="#fff" pointerEvents="none" />
          <Text style={styles.actionBtnText}>رفض</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  topBar: {
    backgroundColor: "#fff",
    padding: 16,
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
  tabs: {
    flexDirection: row,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: palette.primary,
  },
  tabText: {
    fontSize: 14,
    color: palette.textSecondary,
    fontWeight: "500",
    ...rtlText,
  },
  tabTextActive: {
    color: palette.primary,
    fontWeight: "700",
  },
  tabPendingRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
  },
  tabBadge: {
    backgroundColor: palette.red,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  tabBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 28,
  },
  emptyText: {
    textAlign: "center",
    color: palette.textSecondary,
    marginTop: 40,
    fontSize: 14,
    ...rtlText,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardTop: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  cardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.softGreen,
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
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 6,
    ...rtlText,
  },
  cardMeta: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  levelPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sessionText: {
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  progressRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E8E8E8",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: palette.primary,
  },
  progressPct: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.textSecondary,
    minWidth: 36,
    textAlign: "left",
  },
  clockWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.softGold,
    justifyContent: "center",
    alignItems: "center",
  },
  pendingDetail: {
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  actionRow: {
    flexDirection: row,
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  acceptBtn: {
    backgroundColor: palette.primary,
  },
  rejectBtn: {
    backgroundColor: palette.red,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    ...rtlText,
  },
});
