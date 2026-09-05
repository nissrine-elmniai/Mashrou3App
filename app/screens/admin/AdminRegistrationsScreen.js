import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell, Check, X, Mail } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import {
  REGISTRATION_STATUS,
  REGISTRATION_STATUS_LABELS,
  REGISTRATION_KIND,
  REGISTRATION_KIND_LABELS,
  getRegistrationKind,
  SEASON_TYPES,
  SEASON_TYPE_LABELS,
} from "../../constants/roles";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import ActiveSeasonBanner from "../../components/ActiveSeasonBanner";
import { rtlText, row } from "../../constants/rtl";
import { sendMemberAcceptEmail } from "../../utils/sendInviteEmail";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  softGold: "#FFF8E1",
  teal: "#00897B",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
};

export default function AdminRegistrationsScreen({ navigation, route }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "registrations");
  const seasonType = route?.params?.seasonType || SEASON_TYPES.REGULAR;
  const isSummer = seasonType === SEASON_TYPES.SUMMER;

  const {
    registrations,
    seasons,
    getUserById,
    reviewRegistration,
    currentUser,
    stats,
  } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);
  const [filter, setFilter] = useState("pending");
  const [kindFilter, setKindFilter] = useState("all");
  const [sendingId, setSendingId] = useState(null);
  const activeSeason = getActiveRegularSeason(seasons);

  const matchesKind = (reg) => {
    if (kindFilter === "all") return true;
    return getRegistrationKind(reg) === kindFilter;
  };

  const list = useMemo(() => {
    return registrations
      .filter((r) => {
        const season = seasons.find((s) => s.id === r.seasonId);
        if (r.seasonId && season && season.type !== seasonType) return false;
        if (!r.seasonId && seasonType !== SEASON_TYPES.REGULAR) return false;
        if (
          seasonType === SEASON_TYPES.REGULAR &&
          activeSeason &&
          r.seasonId &&
          r.seasonId !== activeSeason.id
        ) {
          return false;
        }
        if (!matchesKind(r)) return false;
        if (filter === "all") return true;
        if (filter === "pending") {
          return r.status === REGISTRATION_STATUS.PENDING;
        }
        if (filter === "accepted") {
          return (
            r.status === REGISTRATION_STATUS.ACCEPTED ||
            r.status === REGISTRATION_STATUS.INVITED ||
            r.status === REGISTRATION_STATUS.ACTIVATED
          );
        }
        if (filter === "rejected") {
          return r.status === REGISTRATION_STATUS.REJECTED;
        }
        return r.status === filter;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [registrations, filter, seasons, seasonType, kindFilter, activeSeason?.id]);

  const pendingCount = useMemo(
    () =>
      registrations.filter((r) => {
        const season = seasons.find((s) => s.id === r.seasonId);
        if (r.seasonId && season && season.type !== seasonType) return false;
        if (!r.seasonId && seasonType !== SEASON_TYPES.REGULAR) return false;
        if (
          seasonType === SEASON_TYPES.REGULAR &&
          activeSeason &&
          r.seasonId &&
          r.seasonId !== activeSeason.id
        ) {
          return false;
        }
        return r.status === REGISTRATION_STATUS.PENDING;
      }).length,
    [registrations, seasons, seasonType, activeSeason?.id]
  );

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const bellCount = stats?.pendingRegs ?? pendingCount;

  const acceptAndInvite = async (reg) => {
    if (getRegistrationKind(reg) === REGISTRATION_KIND.SEASON_RENEWAL) {
      setSendingId(reg.id);
      try {
        const result = await reviewRegistration(
          reg.id,
          REGISTRATION_STATUS.ACCEPTED
        );
        if (!result?.ok) {
          Alert.alert("خطأ", result?.error || "تعذر قبول إعادة التسجيل");
          return;
        }
        Alert.alert("تم القبول", "قُبلت إعادة تسجيل العضو للموسم.");
      } catch (e) {
        Alert.alert("خطأ", e?.message || "حدث خطأ أثناء قبول الطلب");
      } finally {
        setSendingId(null);
      }
      return;
    }

    if (!reg.email) {
      Alert.alert(
        "تنبيه",
        "لا يوجد بريد إلكتروني لهذا الطلب. لا يمكن إرسال الدعوة."
      );
      return;
    }

    setSendingId(reg.id);
    try {
      const result = await reviewRegistration(
        reg.id,
        REGISTRATION_STATUS.ACCEPTED
      );
      if (!result?.ok) {
        Alert.alert("خطأ", result?.error || "تعذر قبول الطلب");
        return;
      }

      const mail = await sendMemberAcceptEmail({
        toEmail: reg.email,
        fullName: reg.fullName,
      });

      if (mail.ok) {
        Alert.alert(
          "تم القبول",
          `تم حفظ البيانات في Supabase وإرسال الرسالة إلى:\n${reg.email}`
        );
      } else {
        Alert.alert(
          "تم القبول وحفظ البيانات — فشل إرسال البريد",
          `${mail.error || ""}\n\nأبلغ المترشح أنه يمكنه إنشاء حسابه من التطبيق بنفس البريد.`
        );
      }
    } catch (e) {
      Alert.alert("خطأ", e?.message || "حدث خطأ أثناء قبول الطلب");
    } finally {
      setSendingId(null);
    }
  };

  const rejectRegistration = (reg) => {
    Alert.alert("تأكيد الرفض", `هل تريد رفض طلب ${reg.fullName}؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "رفض",
        style: "destructive",
        onPress: async () => {
          const result = await reviewRegistration(
            reg.id,
            REGISTRATION_STATUS.REJECTED
          );
          if (!result?.ok) {
            Alert.alert("خطأ", result?.error || "تعذر رفض الطلب");
          }
        },
      },
    ]);
  };

  const resendInvite = async (reg) => {
    setSendingId(reg.id);
    try {
      const mail = await sendMemberAcceptEmail({
        toEmail: reg.email,
        fullName: reg.fullName,
      });
      if (mail.ok) {
        Alert.alert("تم الإرسال", `أُرسلت الرسالة إلى:\n${reg.email}`);
      } else {
        Alert.alert("تنبيه", mail.error || "تعذر إرسال البريد");
      }
    } catch (e) {
      Alert.alert("خطأ", e?.message || "تعذر إرسال البريد");
    } finally {
      setSendingId(null);
    }
  };

  const kindFilters = [
    ["all", "الكل"],
    [REGISTRATION_KIND.JOIN, "طلبات الانضمام"],
    [REGISTRATION_KIND.SEASON_RENEWAL, "إعادة تسجيل"],
  ];

  const filters = [
    ["pending", `قيد الانتظار${pendingCount ? ` (${pendingCount})` : ""}`],
    ["accepted", "المقبولة"],
    ["rejected", "المرفوضة"],
    ["all", "الكل"],
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={openSidebar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>
          {isSummer
            ? "طلبات التسجيل الصيفي"
            : kindFilter === REGISTRATION_KIND.JOIN
              ? "طلبات الانضمام"
              : kindFilter === REGISTRATION_KIND.SEASON_RENEWAL
                ? "إعادة تسجيل الموسم"
                : "طلبات التسجيل"}
        </Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
          hitSlop={12}
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
          {bellCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {bellCount > 9 ? "9+" : bellCount}
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
        {!isSummer ? (
          <ActiveSeasonBanner
            season={activeSeason}
            hint="طلبات هذا الموسم فقط — الموسم السابق لا يظهر هنا"
          />
        ) : null}

        {pendingCount > 0 ? (
          <View style={styles.hintBanner}>
            <Text style={styles.hintBannerText}>
              {pendingCount} طلب بانتظار قرارك — طلبات الانضمام ترسل دعوة
              بالبريد، وإعادة التسجيل تقبل العضو الحالي دون إنشاء حساب جديد
            </Text>
          </View>
        ) : null}

        {!isSummer ? (
          <View style={styles.filterRow}>
            {kindFilters.map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.kindChip,
                  kindFilter === key && styles.kindChipActive,
                ]}
                onPress={() => setKindFilter(key)}
              >
                <Text
                  style={[
                    styles.kindChipText,
                    kindFilter === key && styles.kindChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.filterRow}>
          {filters.map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.filterChip,
                filter === key && styles.filterChipActive,
              ]}
              onPress={() => setFilter(key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  filter === key && styles.filterChipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {list.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد طلبات في هذا التصنيف</Text>
        ) : (
          list.map((reg) => {
            const user = reg.userId ? getUserById(reg.userId) : null;
            const season = seasons.find((s) => s.id === reg.seasonId);
            const kind = getRegistrationKind(reg);
            const title =
              reg.fullName ||
              (user ? `${user.firstName} ${user.lastName}` : "مترشح");
            const sending = sendingId === reg.id;
            const statusColor =
              reg.status === REGISTRATION_STATUS.REJECTED
                ? palette.red
                : reg.status === REGISTRATION_STATUS.PENDING
                  ? palette.gold
                  : palette.primary;

            return (
              <View key={reg.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardAvatar}>
                    <Text style={styles.cardAvatarText}>
                      {(title || "?").charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.cardHeaderInfo}>
                    <Text style={styles.cardName}>{title}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: `${statusColor}22` },
                      ]}
                    >
                      <Text style={[styles.statusPillText, { color: statusColor }]}>
                        {REGISTRATION_STATUS_LABELS[reg.status]}
                      </Text>
                    </View>
                    <View style={styles.kindPill}>
                      <Text style={styles.kindPillText}>
                        {REGISTRATION_KIND_LABELS[kind]}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.metaBlock}>
                  {season ? (
                    <Text style={styles.meta}>
                      {season.name} • {SEASON_TYPE_LABELS[season.type] || ""}
                    </Text>
                  ) : kind === REGISTRATION_KIND.JOIN ? (
                    <Text style={styles.meta}>طلب انضمام — عضو جديد</Text>
                  ) : (
                    <Text style={styles.meta}>إعادة تسجيل موسم</Text>
                  )}
                  {reg.email ? (
                    <Text style={styles.meta}>البريد: {reg.email}</Text>
                  ) : null}
                  {reg.phone ? (
                    <Text style={styles.meta}>الهاتف: {reg.phone}</Text>
                  ) : null}
                  {reg.school ? (
                    <Text style={styles.meta}>المدرسة/الكلية: {reg.school}</Text>
                  ) : null}
                  {reg.level ? (
                    <Text style={styles.meta}>طالب / خريج: {reg.level}</Text>
                  ) : null}
                  {reg.gender ? (
                    <Text style={styles.meta}>الجنس: {reg.gender}</Text>
                  ) : null}
                  {reg.formAnswers?.hasExperience ? (
                    <Text style={styles.meta}>
                      تجربة حفظ مؤطّرة: {reg.formAnswers.hasExperience}
                    </Text>
                  ) : null}
                  {reg.seanceName ? (
                    <Text style={styles.meta}>الحصة: {reg.seanceName}</Text>
                  ) : null}
                  {reg.hifzAmount ? (
                    <Text style={styles.meta}>مقدار الحفظ: {reg.hifzAmount}</Text>
                  ) : null}
                  {reg.formAnswers?.seasonGoal ? (
                    <Text style={styles.meta}>
                      هدف الموسم: {reg.formAnswers.seasonGoal}
                    </Text>
                  ) : null}
                  {reg.formAnswers?.difficulties ? (
                    <Text style={styles.meta}>
                      الصعوبات: {reg.formAnswers.difficulties}
                    </Text>
                  ) : null}
                  {reg.formAnswers?.desiredActivities ? (
                    <Text style={styles.meta}>
                      برامج مقترحة: {reg.formAnswers.desiredActivities}
                    </Text>
                  ) : null}
                </View>

                {reg.status === REGISTRATION_STATUS.PENDING ? (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.acceptBtn]}
                      onPress={sending ? undefined : () => acceptAndInvite(reg)}
                      disabled={!!sending}
                      activeOpacity={0.75}
                    >
                      <Check size={18} color="#fff" pointerEvents="none" />
                      <Text style={styles.actionBtnText}>
                        {sending
                          ? "جاري..."
                          : kind === REGISTRATION_KIND.SEASON_RENEWAL
                            ? "قبول التسجيل"
                            : "قبول وإرسال دعوة"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={sending ? undefined : () => rejectRegistration(reg)}
                      disabled={!!sending}
                      activeOpacity={0.75}
                    >
                      <X size={18} color="#fff" pointerEvents="none" />
                      <Text style={styles.actionBtnText}>رفض</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {reg.status === REGISTRATION_STATUS.INVITED &&
                reg.email &&
                kind === REGISTRATION_KIND.JOIN ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.resendBtn]}
                    onPress={sending ? undefined : () => resendInvite(reg)}
                    disabled={!!sending}
                    activeOpacity={0.75}
                  >
                    <Mail size={18} color="#fff" pointerEvents="none" />
                    <Text style={styles.actionBtnText}>
                      {sending ? "جاري..." : "إعادة إرسال الرسالة"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
      {messagesFab}
      {sidebar}
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
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
  },
  hintBanner: {
    backgroundColor: palette.softGold,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  hintBannerText: {
    fontSize: 13,
    color: palette.textPrimary,
    fontWeight: "600",
    ...rtlText,
  },
  filterRow: {
    flexDirection: row,
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: palette.border,
  },
  filterChipActive: {
    backgroundColor: palette.softGreen,
    borderColor: palette.primary,
  },
  filterChipText: {
    fontSize: 13,
    color: palette.textSecondary,
    fontWeight: "500",
    ...rtlText,
  },
  filterChipTextActive: {
    color: palette.primary,
    fontWeight: "700",
  },
  kindChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#E3F2FD",
    borderWidth: 1,
    borderColor: "#BBDEFB",
  },
  kindChipActive: {
    backgroundColor: "#1976D2",
    borderColor: "#1976D2",
  },
  kindChipText: {
    fontSize: 12,
    color: "#1565C0",
    fontWeight: "600",
    ...rtlText,
  },
  kindChipTextActive: {
    color: "#fff",
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
  cardHeader: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
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
  cardHeaderInfo: {
    flex: 1,
    gap: 6,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    ...rtlText,
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    ...rtlText,
  },
  kindPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#E3F2FD",
  },
  kindPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1565C0",
    ...rtlText,
  },
  metaBlock: {
    marginTop: 4,
    marginBottom: 8,
  },
  meta: {
    fontSize: 13,
    color: palette.textSecondary,
    marginTop: 4,
    ...rtlText,
  },
  actionRow: {
    flexDirection: row,
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  acceptBtn: {
    backgroundColor: palette.primary,
  },
  rejectBtn: {
    backgroundColor: palette.red,
  },
  resendBtn: {
    backgroundColor: palette.teal,
    marginTop: 8,
  },
  actionBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    ...rtlText,
  },
});
