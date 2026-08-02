import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell, Plus, Calendar, Users, Check, X } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { ROLES, userHasRole } from "../../constants/roles";
import { rtlText, row, textAlignStart } from "../../constants/rtl";

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

export default function AdminTestsScreen({ navigation }) {
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

  const [tab, setTab] = useState("all");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [saving, setSaving] = useState(false);

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
          <Text style={styles.cardTitle}>
            {exam.title || exam.level || "اختبار"}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusBadgeText, { color: meta.color }]}>
              {meta.label}
            </Text>
          </View>
        </View>

        {exam.description ? (
          <Text style={styles.cardDesc}>{exam.description}</Text>
        ) : null}

        <View style={styles.metaRow}>
          <Calendar size={14} color={palette.textSecondary} />
          <Text style={styles.metaText}>{exam.date || "—"}</Text>
        </View>

        {group ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>الحصة: {group.name}</Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <Users size={14} color={palette.textSecondary} />
          <Text style={styles.metaText}>
            {participantCount} مشارك
            {participantNames.length
              ? ` — ${participantNames.join("، ")}${
                  participantCount > participantNames.length ? "…" : ""
                }`
              : ""}
          </Text>
        </View>

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
          let countLabel = "";
          if (t.key === "all") countLabel = ` (${counts.all})`;
          if (t.key === "upcoming") countLabel = ` (${counts.upcoming})`;
          if (t.key === "past") countLabel = ` (${counts.past})`;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
                {t.key !== "create" ? countLabel : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
            <Text style={styles.formTitle}>إنشاء اختبار جديد</Text>

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
            <Text style={styles.emptyText}>لا توجد اختبارات في هذا التصنيف</Text>
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => setTab("create")}
            >
              <Plus size={16} color="#fff" />
              <Text style={styles.emptyCreateText}>إنشاء اختبار</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredExams.map(renderExamCard)
        )}
      </ScrollView>
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
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
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
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  card: {
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
  cardHeader: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontWeight: "bold",
    fontSize: 16,
    color: palette.textPrimary,
    ...rtlText,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    ...rtlText,
  },
  cardDesc: {
    color: palette.textSecondary,
    fontSize: 13,
    marginBottom: 8,
    ...rtlText,
  },
  metaRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  metaText: {
    color: palette.textSecondary,
    fontSize: 13,
    ...rtlText,
  },
  scoreText: {
    marginTop: 8,
    color: palette.gold,
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
    paddingVertical: 10,
    borderRadius: 10,
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
    borderRadius: 12,
    padding: 28,
    alignItems: "center",
  },
  emptyText: {
    color: palette.textSecondary,
    marginBottom: 12,
    ...rtlText,
  },
  emptyCreateBtn: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyCreateText: {
    color: "#fff",
    fontWeight: "600",
    ...rtlText,
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: palette.textPrimary,
    marginBottom: 16,
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
