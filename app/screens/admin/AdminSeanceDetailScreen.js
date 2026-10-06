import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  I18nManager,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { rtlText, arrowBack, row } from "../../constants/rtl";
import { deleteSeance, formatSeanceScheduleLabel } from "../../lib/seancesApi";
import { getSeanceMembers } from "../../lib/membersApi";
import { displayProfileEmail } from "../../lib/authEmail";
import { getSeancePresenceOverview } from "../../lib/presenceApi";
import ProfileAvatar from "../../components/ProfileAvatar";

/** Chevron replié : pointe vers la gauche en RTL. */
const MEMBERS_CHEVRON = I18nManager.isRTL ? "chevron-back" : "chevron-forward";

const palette = {
  primary: "#2E7D32",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
  card: "#FFFFFF",
  muted: "#9E9E9E",
};

/** Libellé court du genre, aligné sur la carte séance. */
function genreDisplayLabel(genre) {
  if (genre === "أنثى") return "إناث";
  if (genre === "ذكر") return "ذكور";
  return "";
}

function formatDateDisplay(str) {
  if (!str) return "—";
  const raw = String(str).trim().replace(/\//g, "-").slice(0, 10);
  const parts = raw.split("-");
  if (parts.length !== 3) return String(str);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function InfoRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={palette.primary} />
      </View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatCard({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TopBar({ title, onBack }) {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        hitSlop={12}
        accessibilityLabel="رجوع"
      >
        <Ionicons name={arrowBack} size={22} color={palette.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.topBarTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export default function AdminSeanceDetailScreen({ navigation, route }) {
  const seance = route.params?.seance || null;
  const insets = useSafeAreaInsets();

  const supervisor = seance?.superviseur || null;
  const supervisorName = supervisor
    ? `${supervisor.first_name || ""} ${supervisor.last_name || ""}`.trim() ||
      displayProfileEmail(supervisor)
    : null;
  const schedule = formatSeanceScheduleLabel(seance);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [overview, setOverview] = useState({
    presentCount: 0,
    absentCount: 0,
    sessionCount: 0,
    byDateRows: [],
  });

  const loadOverview = useCallback(async () => {
    if (!seance?.id) {
      setLoading(false);
      setError("بيانات الحصة غير متوفرة");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getSeancePresenceOverview(seance.id);
    if (!res.ok) {
      setError("تعذّر تحميل بيانات الحضور");
      setLoading(false);
      return;
    }
    setOverview({
      presentCount: res.presentCount || 0,
      absentCount: res.absentCount || 0,
      sessionCount: res.sessionCount || 0,
      byDateRows: res.byDateRows || [],
    });
    setLoading(false);
  }, [seance?.id]);

  const loadMembers = useCallback(async () => {
    if (!seance?.id) {
      setMembers([]);
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    setMembersError(null);
    const res = await getSeanceMembers(seance.id);
    if (!res.ok) {
      setMembers([]);
      setMembersError(res.error || "تعذّر تحميل الأعضاء");
      setMembersLoading(false);
      return;
    }
    setMembers(res.members || []);
    setMembersLoading(false);
  }, [seance?.id]);

  useFocusEffect(
    useCallback(() => {
      loadOverview();
      loadMembers();
    }, [loadOverview, loadMembers])
  );

  const confirmDelete = () => {
    const nom = seance?.nom || "الحصة";
    Alert.alert("حذف الحصة", `هل أنت متأكد من حذف حصة «${nom}»؟ لا يمكن التراجع عن هذه العملية.`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          const result = await deleteSeance(seance.id);
          setDeleting(false);
          if (!result.ok) {
            Alert.alert("خطأ", result.error || "تعذر حذف الحصة");
            return;
          }
          navigation.goBack();
        },
      },
    ]);
  };

  const openMember = (member) => {
    navigation.navigate("MemberProfile", {
      memberId: member.userId,
      seanceId: seance.id,
      firstName: member.prenom,
      lastName: member.nom,
      avatarUrl: member.avatarUrl,
      email: member.email,
      phone: member.telephone,
      school: member.ecole,
      level: member.niveau,
      hifzAmount: member.quantiteHifz,
      gender: member.genre,
      canEditSeance: true,
      adminTheme: true,
      viewerRole: "admin",
    });
  };

  const hasMembers = members.length > 0;
  const deleteBlocked = membersLoading || !!membersError || hasMembers;

  const markedTotal = overview.presentCount + overview.absentCount;
  const attendancePct =
    markedTotal > 0
      ? Math.round((overview.presentCount / markedTotal) * 100)
      : 0;

  if (!seance) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar style="dark" />
        <TopBar title="تفاصيل الحصة" onBack={() => navigation.goBack()} />
        <Text style={styles.emptyText}>الحصة غير موجودة</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="dark" />
      <TopBar
        title={seance.nom || "تفاصيل الحصة"}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 28 + Math.max(insets.bottom, 16) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.seanceName}>{seance.nom}</Text>
            <View style={[styles.statusPill, styles.statusActive]}>
              <Text style={[styles.statusText, styles.statusActiveText]}>نشطة</Text>
            </View>
          </View>

          <InfoRow icon="calendar-outline" label="اليوم" value={seance.jour} />
          <InfoRow icon="time-outline" label="التوقيت" value={schedule} />
          <InfoRow
            icon="male-female-outline"
            label="الجنس"
            value={genreDisplayLabel(seance.genre)}
          />
          <InfoRow icon="person-outline" label="المشرف" value={supervisorName} />
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => setMembersOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: membersOpen }}
            accessibilityLabel="عدد الأعضاء"
          >
            <View style={styles.infoIcon}>
              <Ionicons name="people-outline" size={18} color={palette.primary} />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoLabel}>عدد الأعضاء</Text>
              <Text style={styles.infoValue}>
                {membersLoading ? "…" : String(members.length)}
              </Text>
            </View>
            <Ionicons
              name={membersOpen ? "chevron-up" : MEMBERS_CHEVRON}
              size={18}
              color={palette.muted}
            />
          </TouchableOpacity>
          {membersError && !membersOpen ? (
            <Text style={styles.errorText}>{membersError}</Text>
          ) : null}
          {membersOpen ? (
            <View style={styles.membersList}>
              {membersLoading ? (
                <ActivityIndicator color={palette.primary} />
              ) : membersError ? (
                <Text style={styles.errorText}>{membersError}</Text>
              ) : members.length === 0 ? (
                <Text style={styles.membersEmpty}>
                  لا يوجد أعضاء في هذه الحصة بعد
                </Text>
              ) : (
                members.map((member) => {
                  const fullName =
                    `${member.prenom || ""} ${member.nom || ""}`.trim() ||
                    "عضو";
                  return (
                    <TouchableOpacity
                      key={member.userId}
                      style={styles.memberRow}
                      onPress={() => openMember(member)}
                      accessibilityRole="button"
                      accessibilityLabel={fullName}
                    >
                      <ProfileAvatar
                        avatarUrl={member.avatarUrl}
                        userId={member.userId}
                        fallbackLetter={fullName}
                        size={36}
                        softBackgroundColor={palette.softGreen}
                        letterColor={palette.primary}
                      />
                      <Text style={styles.memberName}>{fullName}</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={[styles.card, styles.loadingCard]}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard label="جلسات مسجّلة" value={overview.sessionCount} />
              <StatCard label="نسبة الحضور" value={`${attendancePct}%`} />
            </View>

            <Text style={styles.sectionTitle}>السجل</Text>
            {overview.byDateRows.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>
                  لا توجد سجلات حضور لهذه الحصة بعد
                </Text>
              </View>
            ) : (
              <View style={styles.card}>
                {overview.byDateRows.map((rowItem, idx) => {
                  const total = rowItem.presentCount + rowItem.absentCount;
                  const pct =
                    total > 0
                      ? Math.round((rowItem.presentCount / total) * 100)
                      : 0;
                  const isLast = idx === overview.byDateRows.length - 1;
                  return (
                    <View
                      key={rowItem.sessionDate}
                      style={[styles.sessionRow, isLast && styles.sessionRowLast]}
                    >
                      <Text style={styles.sessionDate}>
                        {formatDateDisplay(rowItem.sessionDate)}
                      </Text>
                      <View style={styles.sessionStats}>
                        <Text style={styles.sessionPresent}>
                          حضور {rowItem.presentCount}
                        </Text>
                        <Text style={styles.sessionAbsent}>
                          غياب {rowItem.absentCount}
                        </Text>
                        <Text style={styles.sessionPct}>{pct}%</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.deleteBtn, deleteBlocked && styles.deleteBtnDisabled]}
          onPress={confirmDelete}
          disabled={deleteBlocked || deleting}
          accessibilityRole="button"
          accessibilityState={{ disabled: deleteBlocked || deleting }}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons
                name="trash-outline"
                size={18}
                color={deleteBlocked ? palette.muted : "#fff"}
              />
              <Text
                style={[
                  styles.deleteBtnText,
                  deleteBlocked && styles.deleteBtnTextDisabled,
                ]}
              >
                حذف الحصة
              </Text>
            </>
          )}
        </TouchableOpacity>
        {hasMembers ? (
          <Text style={styles.deleteHint}>
            لا يمكن حذف حصة بها أعضاء — انقل الأعضاء إلى حصة أخرى أولاً
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
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
  backBtn: { padding: 2 },
  topBarTitle: {
    flex: 1,
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    ...rtlText,
  },
  headerSpacer: { width: 26 },
  content: { padding: 16 },
  card: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 14,
  },
  loadingCard: {
    alignItems: "center",
    paddingVertical: 28,
  },
  titleRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  seanceName: {
    flex: 1,
    fontSize: 18,
    fontWeight: "bold",
    color: palette.textPrimary,
    ...rtlText,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusActive: { backgroundColor: palette.softGreen },
  statusText: { fontSize: 12, fontWeight: "600", ...rtlText },
  statusActiveText: { color: palette.primary },
  infoRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.softGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTextWrap: { flex: 1 },
  infoLabel: {
    fontSize: 12,
    color: palette.textSecondary,
    ...rtlText,
  },
  infoValue: {
    fontSize: 14,
    color: palette.textPrimary,
    fontWeight: "600",
    marginTop: 2,
    ...rtlText,
  },
  statsRow: {
    flexDirection: row,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: palette.primary,
    ...rtlText,
  },
  statLabel: {
    fontSize: 13,
    color: palette.textSecondary,
    marginTop: 6,
    textAlign: "center",
    ...rtlText,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 10,
    ...rtlText,
  },
  sessionRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  sessionRowLast: {
    borderBottomWidth: 0,
  },
  sessionDate: {
    fontWeight: "600",
    color: palette.textPrimary,
    fontSize: 14,
    ...rtlText,
  },
  sessionStats: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  sessionPresent: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: "600",
    ...rtlText,
  },
  sessionAbsent: {
    color: palette.red,
    fontSize: 13,
    fontWeight: "600",
    ...rtlText,
  },
  sessionPct: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "bold",
    minWidth: 36,
    textAlign: "left",
    ...rtlText,
  },
  emptyText: {
    textAlign: "center",
    color: palette.textSecondary,
    paddingVertical: 12,
    marginTop: 8,
    ...rtlText,
  },
  errorText: {
    color: palette.red,
    textAlign: "center",
    ...rtlText,
  },
  membersList: {
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  membersEmpty: {
    color: palette.textSecondary,
    fontSize: 13,
    paddingVertical: 10,
    ...rtlText,
  },
  memberRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: palette.textPrimary,
    ...rtlText,
  },
  deleteBtn: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.red,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  deleteBtnDisabled: {
    backgroundColor: "#EEEEEE",
  },
  deleteBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    ...rtlText,
  },
  deleteBtnTextDisabled: {
    color: palette.muted,
  },
  deleteHint: {
    color: palette.textSecondary,
    fontSize: 13,
    marginTop: 8,
    ...rtlText,
  },
});
