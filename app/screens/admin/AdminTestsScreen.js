import React, { useMemo, useState, useEffect, useCallback } from "react";
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
  Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Menu, Bell, Plus, Calendar, Check, X, ClipboardList, Link } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { rtlText, row, textAlignStart } from "../../constants/rtl";
import {
  getAllTestsAdmin,
  createTest,
  updateTestStatus,
  TEST_TYPE_LABELS,
} from "../../lib/testsApi";

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

const TEST_TYPES = [
  { key: "hifz", label: "اختبار الحفظ" },
  { key: "sunnah", label: "حفاظ السنة" },
];

function toIsoDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(value) {
  const iso = String(value || "").slice(0, 10);
  if (!iso) return "اختر تاريخ الاختبار";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function getExamKind(test) {
  if (test.statut === "annule") return "cancelled";
  if (test.statut === "termine") return "past";
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
  const { openSidebar, sidebar } = useAdminSidebar(navigation, "tests");
  const { currentUser, stats } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const [tab, setTab] = useState(route?.params?.initialTab || "all");
  const [testType, setTestType] = useState("hifz");
  const [title, setTitle] = useState("");
  const [testDate, setTestDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [quranQuantity, setQuranQuantity] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [tests, setTests] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const testsRes = await getAllTestsAdmin();
    if (testsRes.ok) setTests(testsRes.tests);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const next = route?.params?.initialTab;
    if (next) setTab(next);
  }, [route?.params?.initialTab]);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  const sortedTests = useMemo(() => {
    return [...tests].sort((a, b) => {
      const da = a.created_at || "";
      const db = b.created_at || "";
      return da < db ? 1 : -1;
    });
  }, [tests]);

  const filteredTests = useMemo(() => {
    if (tab === "all" || tab === "create") return sortedTests;
    return sortedTests.filter((t) => {
      const kind = getExamKind(t);
      if (tab === "upcoming") return kind === "upcoming";
      if (tab === "past") return kind === "past" || kind === "cancelled";
      return true;
    });
  }, [sortedTests, tab]);

  const counts = useMemo(() => {
    let upcoming = 0;
    let past = 0;
    sortedTests.forEach((t) => {
      const kind = getExamKind(t);
      if (kind === "upcoming") upcoming += 1;
      else past += 1;
    });
    return { all: sortedTests.length, upcoming, past };
  }, [sortedTests]);

  const resetForm = () => {
    setTestType("hifz");
    setTitle("");
    setTestDate(null);
    setQuranQuantity("");
    setFormUrl("");
    setShowDatePicker(false);
  };

  const handleCreate = async () => {
    setSaving(true);
    const created = await createTest({
      titre: title,
      type: testType,
      dateTest: toIsoDate(testDate),
      quranQuantity,
      formUrl,
    });
    setSaving(false);
    if (!created.ok) {
      Alert.alert("تنبيه", created.error);
      return;
    }
    Alert.alert("تم الإعلان", "تم إعلان الاختبار بنجاح");
    resetForm();
    setTab("upcoming");
    loadAll();
  };

  const confirmCancel = (test) => {
    Alert.alert("إلغاء الاختبار", `هل تريد إلغاء «${test.titre || "اختبار"}»؟`, [
      { text: "تراجع", style: "cancel" },
      {
        text: "إلغاء",
        style: "destructive",
        onPress: async () => {
          const result = await updateTestStatus({ testId: test.id, statut: "annule" });
          if (!result.ok) Alert.alert("خطأ", result.error);
          loadAll();
        },
      },
    ]);
  };

  const confirmComplete = (test) => {
    Alert.alert("تعليم كمنجز", `هل تم إنجاز «${test.titre || "اختبار"}»؟`, [
      { text: "تراجع", style: "cancel" },
      {
        text: "تأكيد",
        onPress: async () => {
          const result = await updateTestStatus({ testId: test.id, statut: "termine" });
          if (!result.ok) Alert.alert("خطأ", result.error);
          loadAll();
        },
      },
    ]);
  };

  const renderTestCard = (test) => {
    const kind = getExamKind(test);
    const meta = statusMeta(kind);
    const typeLabel = TEST_TYPE_LABELS[test.type] || test.titre || "اختبار";

    return (
      <View key={test.id} style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <ClipboardList size={20} color={palette.primary} pointerEvents="none" />
          </View>
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.cardTitle}>{test.titre || typeLabel}</Text>
            <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.statusBadgeText, { color: meta.color }]}>
                {meta.label}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.metaPills}>
          {typeLabel ? (
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{typeLabel}</Text>
            </View>
          ) : null}
          <View style={styles.metaPill}>
            <Calendar size={13} color={palette.textSecondary} />
            <Text style={styles.metaPillText}>
              {formatDateLabel(test.date_test || test.created_at)}
            </Text>
          </View>
          {test.type === "hifz" && test.quran_quantity ? (
            <View style={styles.metaPill}>
              <ClipboardList size={13} color={palette.textSecondary} />
              <Text style={styles.metaPillText}>{test.quran_quantity}</Text>
            </View>
          ) : null}
          {test.type === "sunnah" && test.form_url ? (
            <TouchableOpacity
              style={styles.metaPill}
              onPress={() => Linking.openURL(test.form_url)}
            >
              <Link size={13} color={palette.primary} />
              <Text style={[styles.metaPillText, { color: palette.primary }]}>
                Google Form
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {kind === "upcoming" ? (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.completeBtn]}
              onPress={() => confirmComplete(test)}
            >
              <Check size={16} color="#fff" />
              <Text style={styles.actionBtnText}>تم الإنجاز</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={() => confirmCancel(test)}
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
          onPress={openSidebar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
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
        {loading && tab !== "create" ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>جاري التحميل...</Text>
          </View>
        ) : tab === "create" ? (
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderIcon}>
                <Plus size={20} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>إعلان اختبار جديد</Text>
                <Text style={styles.formSubtitle}>
                  اختر النوع ثم أعلن التاريخ والتفاصيل
                </Text>
              </View>
            </View>

            <Text style={styles.label}>نوع الاختبار</Text>
            <View style={styles.groupChips}>
              {TEST_TYPES.map((item) => {
                const active = testType === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.groupChip, active && styles.groupChipActive]}
                    onPress={() => setTestType(item.key)}
                  >
                    <Text
                      style={[
                        styles.groupChipText,
                        active && styles.groupChipTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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

            <Text style={styles.label}>تاريخ الاختبار</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowDatePicker(true)}
            >
              <Calendar size={18} color={palette.primary} />
              <Text style={styles.dateBtnText}>
                {formatDateLabel(toIsoDate(testDate))}
              </Text>
            </TouchableOpacity>
            {showDatePicker ? (
              <DateTimePicker
                value={testDate || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selected) => {
                  if (Platform.OS !== "ios") setShowDatePicker(false);
                  if (event.type === "dismissed") return;
                  if (selected) setTestDate(selected);
                }}
              />
            ) : null}
            {Platform.OS === "ios" && showDatePicker ? (
              <TouchableOpacity
                style={styles.dateDoneBtn}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.dateDoneText}>تم</Text>
              </TouchableOpacity>
            ) : null}

            {testType === "hifz" ? (
              <>
                <Text style={styles.label}>كمية القرآن المراد تقييمها</Text>
                <TextInput
                  style={styles.input}
                  placeholder="مثال: جزء عمّ — أو 10 صفحات"
                  placeholderTextColor={palette.placeholder}
                  value={quranQuantity}
                  onChangeText={setQuranQuantity}
                  textAlign={textAlignStart}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>رابط Google Form</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://docs.google.com/forms/..."
                  placeholderTextColor={palette.placeholder}
                  value={formUrl}
                  onChangeText={setFormUrl}
                  autoCapitalize="none"
                  keyboardType="url"
                  textAlign={textAlignStart}
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, saving && { opacity: 0.6 }]}
              onPress={saving ? undefined : handleCreate}
            >
              <Plus size={18} color="#fff" />
              <Text style={styles.submitText}>
                {saving ? "جاري الإعلان..." : "إعلان الاختبار"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : filteredTests.length === 0 ? (
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
          filteredTests.map(renderTestCard)
        )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  dateBtn: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    backgroundColor: palette.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  dateBtnText: {
    fontSize: 15,
    color: palette.textPrimary,
    ...rtlText,
  },
  dateDoneBtn: {
    alignSelf: "flex-start",
    backgroundColor: palette.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 14,
  },
  dateDoneText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    ...rtlText,
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
