import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell, Plus, Calendar, Users, Check, X, ClipboardList, Clock } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { ROLES, userHasRole } from "../../constants/roles";
import { rtlText, row, textAlignStart } from "../../constants/rtl";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  softGold: "#FFF8E1",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  softBlue: "#E3F2FD",
  blue: "#1976D2",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
};

const TABS = [
  { key: "all", label: "الكل" },
  { key: "upcoming", label: "قادمة" },
  { key: "past", label: "سابقة" },
  { key: "create", label: "إنشاء" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getExamKind(exam) {
  if (exam.status === "cancelled") return "cancelled";
  if (exam.status === "completed" || exam.score != null) return "past";
  const date = exam.date || "";
  if (date && date < todayISO()) return "past";
  return "upcoming";
}

function statusMeta(kind) {
  if (kind === "upcoming") {
    return { label: "قادم", color: palette.primary, bg: palette.softGreen };
  }
  if (kind === "past") {
    return { label: "منجز / سابق", color: palette.blue, bg: "#E3F2FD" };
  }
  return { label: "ملغى", color: palette.red, bg: "#FFEBEE" };
}

export default function AdminTestsScreen({ navigation, route }) {
  const {
    currentUser,
    stats,
    exams,
    users,
    groups,
    createExam,
    cancelExam,
    markExamCompleted,
    getUserById,
  } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const [tab, setTab] = useState(route?.params?.initialTab || "all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = route?.params?.initialTab;
    if (next) setTab(next);
  }, [route?.params?.initialTab]);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  const members = useMemo(
    () => users.filter((u) => userHasRole(u, ROLES.MEMBER)),
    [users]
  );

  const membersForGroup = useMemo(() => {
    if (!selectedGroupId) return members;
    const group = groups.find((g) => g.id === selectedGroupId);
    if (!group) return members;
    return members.filter((m) => (group.memberIds || []).includes(m.id));
  }, [members, groups, selectedGroupId]);

  const sortedExams = useMemo(() => {
    return [...exams].sort((a, b) => {
      const da = a.date || a.createdAt || "";
      const db = b.date || b.createdAt || "";
      return da < db ? 1 : -1;
    });
  }, [exams]);

  const filteredExams = useMemo(() => {
    if (tab === "all" || tab === "create") return sortedExams;
    return sortedExams.filter((e) => {
      const kind = getExamKind(e);
      if (tab === "upcoming") return kind === "upcoming";
      if (tab === "past") return kind === "past" || kind === "cancelled";
      return true;
    });
  }, [sortedExams, tab]);

  const counts = useMemo(() => {
    let upcoming = 0;
    let past = 0;
    sortedExams.forEach((e) => {
      const kind = getExamKind(e);
      if (kind === "upcoming") upcoming += 1;
      else past += 1;
    });
    return { all: sortedExams.length, upcoming, past };
  }, [sortedExams]);

  const toggleMember = (id) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedMemberIds.length === membersForGroup.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(membersForGroup.map((m) => m.id));
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDate(todayISO());
    setSelectedGroupId(null);
    setSelectedMemberIds([]);
    setNotifyMembers(true);
  };

  const handleCreate = () => {
    setSaving(true);
    const result = createExam({
      title,
      description,
      date,
      groupId: selectedGroupId,
      memberIds: selectedMemberIds,
      notifyMembers,
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return;
    }
    Alert.alert("تم الإنشاء", "تم جدولة الاختبار بنجاح");
    resetForm();
    setTab("upcoming");
  };

  const confirmCancel = (exam) => {
    Alert.alert("إلغاء الاختبار", `هل تريد إلغاء «${exam.title || "اختبار"}»؟`, [
      { text: "تراجع", style: "cancel" },
      {
        text: "إلغاء",
        style: "destructive",
        onPress: () => {
          const result = cancelExam(exam.id);
          if (!result.ok) Alert.alert("خطأ", result.error);
        },
      },
    ]);
  };

  const confirmComplete = (exam) => {
    Alert.alert("تعليم كمنجز", `هل تم إنجاز «${exam.title || "اختبار"}»؟`, [
      { text: "تراجع", style: "cancel" },
      {
        text: "تأكيد",
        onPress: () => {
          const result = markExamCompleted(exam.id);
          if (!result.ok) Alert.alert("خطأ", result.error);
        },
      },
    ]);
  };

  const renderExamCard = (exam) => {
    const kind = getExamKind(exam);
    const meta = statusMeta(kind);
    const group = exam.groupId
      ? groups.find((g) => g.id === exam.groupId)
      : null;
    const participantCount =
      exam.memberIds?.length ||
      (exam.memberId ? 1 : 0);
    const participantNames = (exam.memberIds || [])
      .slice(0, 3)
      .map((id) => {
        const u = getUserById(id);
        return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "";
      })
      .filter(Boolean);

    if (exam.memberId && !exam.memberIds) {
      const u = getUserById(exam.memberId);
      if (u) {
        participantNames.push(
          `${u.firstName || ""} ${u.lastName || ""}`.trim()
        );
      }
    }

    return (
      <View key={exam.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <ClipboardList size={20} color={palette.primary} pointerEvents="none" />
          </View>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.cardTitle}>
              {exam.title || exam.level || "اختبار"}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.statusBadgeText, { color: meta.color }]}>
                {meta.label}
              </Text>
            </View>
          </View>
        </View>

        {exam.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {exam.description}
          </Text>
        ) : null}

        <View style={styles.metaPills}>
          <View style={styles.metaPill}>
            <Calendar size={13} color={palette.textSecondary} />
            <Text style={styles.metaPillText}>{exam.date || "—"}</Text>
          </View>
          {group ? (
            <View style={styles.metaPill}>
              <Clock size={13} color={palette.textSecondary} />
              <Text style={styles.metaPillText}>{group.name}</Text>
            </View>
          ) : null}
          <View style={styles.metaPill}>
            <Users size={13} color={palette.textSecondary} />
            <Text style={styles.metaPillText}>{participantCount} مشارك</Text>
          </View>
        </View>

        {participantNames.length ? (
          <Text style={styles.participantsText} numberOfLines={1}>
            {participantNames.join("، ")}
            {participantCount > participantNames.length ? "…" : ""}
          </Text>
        ) : null}

        {exam.score != null ? (
          <Text style={styles.scoreText}>
            الدرجة: {exam.score}
            {exam.level ? ` — ${exam.level}` : ""}
          </Text>
        ) : null}

        {kind === "upcoming" ? (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.completeBtn]}
              onPress={() => confirmComplete(exam)}
            >
              <Check size={16} color="#fff" />
              <Text style={styles.actionBtnText}>تم الإنجاز</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={() => confirmCancel(exam)}
            >
              <X size={16} color="#fff" />
              <Text style={styles.actionBtnText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>الاختبارات</Text>
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
        {TABS.map((t) => {
          const active = tab === t.key;
          let count = null;
          if (t.key === "all") count = counts.all;
          if (t.key === "upcoming") count = counts.upcoming;
          if (t.key === "past") count = counts.past;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
              </Text>
              {count != null ? (
                <View
                  style={[
                    styles.tabCount,
                    active && styles.tabCountActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      active && styles.tabCountTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              ) : (
                <Plus
                  size={14}
                  color={active ? palette.primary : palette.textSecondary}
                  style={{ marginTop: 2 }}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <KeyboardAvoidingView
        style={styles.scroll}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + bottomGap },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {tab === "create" ? (
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderIcon}>
                <Plus size={20} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>إنشاء اختبار جديد</Text>
                <Text style={styles.formSubtitle}>
                  حدّد العنوان والتاريخ والمشاركين
                </Text>
              </View>
            </View>

            <Text style={styles.label}>عنوان الاختبار</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: اختبار الجزء الأول"
              placeholderTextColor={palette.placeholder}
              value={title}
              onChangeText={setTitle}
              textAlign={textAlignStart}
            />

            <Text style={styles.label}>الوصف</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="وصف الاختبار..."
              placeholderTextColor={palette.placeholder}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              textAlign={textAlignStart}
            />

            <Text style={styles.label}>تاريخ الاختبار</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.placeholder}
              value={date}
              onChangeText={setDate}
              textAlign={textAlignStart}
            />

            <Text style={styles.label}>الحصة (اختياري)</Text>
            <View style={styles.groupChips}>
              <TouchableOpacity
                style={[
                  styles.groupChip,
                  !selectedGroupId && styles.groupChipActive,
                ]}
                onPress={() => {
                  setSelectedGroupId(null);
                  setSelectedMemberIds([]);
                }}
              >
                <Text
                  style={[
                    styles.groupChipText,
                    !selectedGroupId && styles.groupChipTextActive,
                  ]}
                >
                  الكل
                </Text>
              </TouchableOpacity>
              {groups.map((g) => {
                const active = selectedGroupId === g.id;
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.groupChip, active && styles.groupChipActive]}
                    onPress={() => {
                      setSelectedGroupId(g.id);
                      setSelectedMemberIds([]);
                    }}
                  >
                    <Text
                      style={[
                        styles.groupChipText,
                        active && styles.groupChipTextActive,
                      ]}
                    >
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.checklistHeader}>
              <Text style={styles.label}>الأعضاء المشاركون</Text>
              <TouchableOpacity onPress={handleSelectAll}>
                <Text style={styles.selectAllText}>
                  {selectedMemberIds.length === membersForGroup.length &&
                  membersForGroup.length > 0
                    ? "إلغاء الكل"
                    : "اختيار الكل"}
                </Text>
              </TouchableOpacity>
            </View>

            {membersForGroup.length === 0 ? (
              <Text style={styles.emptyText}>لا يوجد أعضاء متاحون</Text>
            ) : (
              membersForGroup.map((member) => {
                const isSelected = selectedMemberIds.includes(member.id);
                const name = `${member.firstName || ""} ${member.lastName || ""}`.trim();
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.checkItem,
                      isSelected && styles.checkItemSelected,
                    ]}
                    onPress={() => toggleMember(member.id)}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxChecked,
                      ]}
                    >
                      {isSelected ? (
                        <Text style={styles.checkmark}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={styles.checkLabel}>{name || member.email}</Text>
                  </TouchableOpacity>
                );
              })
            )}

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>إرسال إشعار للأعضاء</Text>
              <TouchableOpacity
                style={[
                  styles.toggleTrack,
                  notifyMembers && styles.toggleTrackOn,
                ]}
                onPress={() => setNotifyMembers((v) => !v)}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    notifyMembers && styles.toggleThumbOn,
                  ]}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, saving && { opacity: 0.6 }]}
              onPress={saving ? undefined : handleCreate}
            >
              <Plus size={18} color="#fff" />
              <Text style={styles.submitText}>
                {saving ? "جاري الإنشاء..." : "إنشاء الاختبار"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : filteredExams.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <ClipboardList
                size={36}
                color={palette.primary}
                pointerEvents="none"
              />
            </View>
            <Text style={styles.emptyTitle}>لا توجد اختبارات هنا</Text>
            <Text style={styles.emptyText}>
              {tab === "upcoming"
                ? "لا توجد اختبارات قادمة حالياً"
                : tab === "past"
                  ? "لا توجد اختبارات سابقة بعد"
                  : "ابدأ بإنشاء أول اختبار للأعضاء"}
            </Text>
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => setTab("create")}
              activeOpacity={0.8}
            >
              <Plus size={18} color="#fff" />
              <Text style={styles.emptyCreateText}>إنشاء اختبار</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredExams.map(renderExamCard)
        )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: palette.primary,
  },
  tabText: {
    fontSize: 13,
    color: palette.textSecondary,
    fontWeight: "500",
    ...rtlText,
  },
  tabTextActive: {
    color: palette.primary,
    fontWeight: "700",
  },
  tabCount: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "#EEEEEE",
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountActive: {
    backgroundColor: palette.softGreen,
  },
  tabCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.textSecondary,
  },
  tabCountTextActive: {
    color: palette.primary,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
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
    marginBottom: 10,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.softGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  cardHeaderInfo: {
    flex: 1,
    gap: 6,
  },
  cardTitle: {
    fontWeight: "700",
    fontSize: 15,
    color: palette.textPrimary,
    ...rtlText,
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    ...rtlText,
  },
  cardDesc: {
    color: palette.textSecondary,
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 20,
    ...rtlText,
  },
  metaPills: {
    flexDirection: row,
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    flexDirection: row,
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.background,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metaPillText: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: "500",
    ...rtlText,
  },
  participantsText: {
    marginTop: 8,
    color: palette.textSecondary,
    fontSize: 12,
    ...rtlText,
  },
  scoreText: {
    marginTop: 8,
    color: "#F9A825",
    fontWeight: "700",
    fontSize: 14,
    ...rtlText,
  },
  cardActions: {
    flexDirection: row,
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  completeBtn: { backgroundColor: palette.primary },
  cancelBtn: { backgroundColor: palette.red },
  actionBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
    ...rtlText,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: palette.softGreen,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 6,
    ...rtlText,
  },
  emptyText: {
    color: palette.textSecondary,
    marginBottom: 18,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    ...rtlText,
  },
  emptyCreateBtn: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyCreateText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    ...rtlText,
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  formHeader: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  formHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.softGreen,
    justifyContent: "center",
    alignItems: "center",
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.textPrimary,
    ...rtlText,
  },
  formSubtitle: {
    fontSize: 12,
    color: palette.textSecondary,
    marginTop: 2,
    ...rtlText,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.textSecondary,
    marginBottom: 6,
    ...rtlText,
  },
  input: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.background,
    fontSize: 15,
    color: palette.textPrimary,
    marginBottom: 14,
    ...rtlText,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  groupChips: {
    flexDirection: row,
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  groupChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
  },
  groupChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  groupChipText: {
    fontSize: 13,
    color: palette.textSecondary,
    ...rtlText,
  },
  groupChipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  checklistHeader: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  selectAllText: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: "500",
    ...rtlText,
  },
  checkItem: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    padding: 10,
    backgroundColor: palette.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 6,
  },
  checkItemSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.softGreen,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.border,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  checkmark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  checkLabel: {
    color: palette.textPrimary,
    fontSize: 14,
    flex: 1,
    ...rtlText,
  },
  toggleRow: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    backgroundColor: palette.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    marginTop: 10,
    marginBottom: 16,
  },
  toggleLabel: {
    color: palette.textPrimary,
    fontSize: 14,
    ...rtlText,
  },
  toggleTrack: {
    width: 48,
    height: 24,
    borderRadius: 12,
    backgroundColor: palette.border,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleTrackOn: {
    backgroundColor: palette.gold,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  toggleThumbOn: {
    alignSelf: "flex-end",
  },
  submitBtn: {
    width: "100%",
    paddingVertical: 14,
    backgroundColor: palette.primary,
    borderRadius: 16,
    alignItems: "center",
    flexDirection: row,
    justifyContent: "center",
    gap: 8,
  },
  submitText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    ...rtlText,
  },
});
