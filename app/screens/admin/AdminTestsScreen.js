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
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Menu, Bell, Plus } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import { pickDateTime, useIosDateTimePicker, IosDateTimePicker } from "../../lib/pickDateTime";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { rtlText, row, textAlignStart, fonts } from "../../constants/rtl";
import { colors, radii } from "../../constants/theme";
import { SectionCard } from "../../components/ui";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { getAllTestsAdmin, createTest } from "../../lib/testsApi";
import {
  getTestDisplayStatus,
  TEST_TYPE_LABELS,
  formatTestDate,
  formatShortTestDate,
  formatTestTime,
  casablancaTodayIso,
  addCalendarDays,
  isoToLocalDate,
} from "../../constants/tests";
import { colorWithAlpha } from "../../components/tests/StatusBadge";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";

const TABS = [
  { key: "all", label: "الكل" },
  { key: "upcoming", label: "الحالية" },
  { key: "past", label: "السابقة" },
];

const TEST_TYPES = [
  { key: "hifz", label: TEST_TYPE_LABELS.hifz },
  { key: "sunnah", label: TEST_TYPE_LABELS.sunnah },
];

const EMPTY_BY_TAB = {
  all: "ابدأ بإنشاء أول اختبار للأعضاء",
  upcoming: "لا توجد اختبارات حالية",
  past: "لا توجد اختبارات سابقة بعد",
};

function testStatusOf(test) {
  return getTestDisplayStatus(test);
}

function isPlanned(test) {
  return test?.statut !== "termine" && test?.statut !== "annule";
}

function proposedIsos(test) {
  const rows = Array.isArray(test?.test_dates) ? test.test_dates : [];
  return rows
    .map((row) => String(row?.date_proposee || "").slice(0, 10))
    .filter((iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso))
    .sort();
}

export default function AdminTestsScreen({ navigation, route }) {
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "tests");
  const { currentUser, seasons } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);
  const defaultSeasonId = getActiveRegularSeason(seasons)?.id || null;
  const activeSeasons = useMemo(
    () => (seasons || []).filter((season) => season.active),
    [seasons]
  );

  const [tab, setTab] = useState(route?.params?.initialTab || "all");
  const [testType, setTestType] = useState("hifz");
  const [title, setTitle] = useState("");
  const [saisonId, setSaisonId] = useState(null);
  const [quranQuantity, setQuranQuantity] = useState("");
  const [quantityTouched, setQuantityTouched] = useState(false);
  const [quantityAttempted, setQuantityAttempted] = useState(false);
  const [proposedDates, setProposedDates] = useState([]);
  const [datesAttempted, setDatesAttempted] = useState(false);
  const [slotError, setSlotError] = useState("");
  const iosPicker = useIosDateTimePicker();
  const [tests, setTests] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadAll = useCallback(async (mode = "load") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    const testsRes = await getAllTestsAdmin();
    if (!testsRes.ok) {
      setError(testsRes.error || "تعذر تحميل الاختبارات");
      if (mode !== "refresh") setTests([]);
    } else {
      setError("");
      setTests(testsRes.tests || []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  useEffect(() => {
    setSaisonId((current) => {
      if (current && activeSeasons.some((season) => season.id === current)) {
        return current;
      }
      const preferred = activeSeasons.find((season) => season.id === defaultSeasonId);
      return preferred?.id || null;
    });
  }, [defaultSeasonId, activeSeasons]);

  useEffect(() => {
    const next = route?.params?.initialTab;
    if (next) setTab(next);
  }, [route?.params?.initialTab]);

  const sortedTests = useMemo(() => {
    return [...tests].sort((a, b) => {
      const da = a.created_at || "";
      const db = b.created_at || "";
      return da < db ? 1 : -1;
    });
  }, [tests]);

  const filteredTests = useMemo(() => {
    if (tab === "all" || tab === "create") return sortedTests;
    if (tab === "past") return sortedTests.filter((test) => !isPlanned(test));
    return sortedTests
      .filter((test) => isPlanned(test))
      .sort((a, b) => {
        const aRank = getTestDisplayStatus(a).key === "en_cours" ? 0 : 1;
        const bRank = getTestDisplayStatus(b).key === "en_cours" ? 0 : 1;
        return aRank - bRank;
      });
  }, [sortedTests, tab]);

  const counts = useMemo(() => {
    let upcoming = 0;
    let past = 0;
    sortedTests.forEach((test) => {
      if (isPlanned(test)) upcoming += 1;
      else past += 1;
    });
    return { all: sortedTests.length, upcoming, past };
  }, [sortedTests]);

  const todayIso = casablancaTodayIso();
  const tomorrowIso = addCalendarDays(todayIso, 1);
  const quantityMissing =
    testType === "hifz" && !String(quranQuantity || "").trim();
  const datesMissing = proposedDates.length === 0;
  const canSubmit = Boolean(
    String(title || "").trim() &&
      saisonId &&
      !saving &&
      !quantityMissing &&
      !datesMissing
  );
  const showQuantityError =
    quantityMissing && (quantityTouched || quantityAttempted);
  const showDatesError = datesMissing && datesAttempted;

  const resetForm = () => {
    setTestType("hifz");
    setTitle("");
    setQuranQuantity("");
    setQuantityTouched(false);
    setQuantityAttempted(false);
    setProposedDates([]);
    setDatesAttempted(false);
    setSlotError("");
  };

  const openDatePicker = async () => {
    setSlotError("");
    const slot = await pickDateTime({
      minimumDate: isoToLocalDate(tomorrowIso),
      initialDate: isoToLocalDate(tomorrowIso),
    });
    if (!slot) return;
    let duplicate = false;
    setProposedDates((prev) => {
      if (prev.some((item) => item.date === slot.date)) {
        duplicate = true;
        return prev;
      }
      return [...prev, slot].sort((a, b) => a.date.localeCompare(b.date));
    });
    if (duplicate) {
      setSlotError("هذا التاريخ مضاف مسبقاً");
      return;
    }
    setDatesAttempted(true);
    setSlotError("");
  };

  const handleCreate = async () => {
    if (quantityMissing) setQuantityAttempted(true);
    if (datesMissing) setDatesAttempted(true);
    if (!canSubmit) return;
    setSaving(true);
    const created = await createTest({
      saisonId,
      titre: title,
      type: testType,
      quranQuantity,
      dates: proposedDates,
    });
    setSaving(false);
    if (!created.ok) {
      Alert.alert("تنبيه", created.error);
      return;
    }
    const invitedCount = created.invitedCount ?? 0;
    if (invitedCount === 0) {
      Alert.alert("تنبيه", "لا يوجد أعضاء مقبولون في هذا الموسم");
    } else {
      Alert.alert("تم الإعلان", `تمت دعوة ${invitedCount} أعضاء`);
    }
    resetForm();
    setTab("upcoming");
    loadAll();
  };

  const renderTestCard = (test) => {
    const status = testStatusOf(test);
    const typeLabel = TEST_TYPE_LABELS[test.type] || "اختبار";
    const quantity = String(test.quran_quantity || "").trim();
    const typeLine = quantity ? `${typeLabel} · ${quantity}` : typeLabel;
    const invitations = test.invitations || [];
    const total = invitations.length;
    const noted = invitations.filter((item) => item.statut === "note").length;
    const confirmed = invitations.filter(
      (item) => item.statut === "confirme" || item.statut === "note"
    ).length;
    const isos = proposedIsos(test);
    const nextDate = isPlanned(test) ? isos.find((iso) => todayIso && iso >= todayIso) : "";
    const closedDate = !isPlanned(test)
      ? formatTestDate(isos[isos.length - 1] || test.created_at)
      : "";
    const ratio = total > 0 ? Math.round((noted / total) * 100) : 0;

    return (
      <TouchableOpacity
        key={test.id}
        style={[
          styles.listCard,
          { borderStartColor: status.color },
          test.statut === "annule" && styles.listCardMuted,
        ]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate("AdminTestDetail", { testId: test.id })}
        accessibilityRole="button"
        accessibilityLabel={test.titre || typeLabel}
      >
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {test.titre || typeLabel}
          </Text>
          <View style={styles.statusWrap}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        <View style={styles.cardMetaRow}>
          <Text style={styles.cardMetaText} numberOfLines={1}>
            {typeLine}
          </Text>
          {isPlanned(test) ? (
            nextDate ? (
              <Text style={styles.cardDate} numberOfLines={1}>
                {"الموعد القادم: "}
                <Text style={styles.timeLtr}>{formatTestDate(nextDate)}</Text>
              </Text>
            ) : (
              <Text style={styles.cardDate} numberOfLines={1}>
                انتهت المواعيد
              </Text>
            )
          ) : closedDate ? (
            <Text style={[styles.cardDate, styles.timeLtr]} numberOfLines={1}>
              {closedDate}
            </Text>
          ) : null}
        </View>

        <View style={styles.cardFootRow}>
          {total > 0 ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${ratio}%` }]} />
            </View>
          ) : null}
          <Text style={styles.cardFootText} numberOfLines={1}>
            {total === 0 ? (
              "لا يوجد مدعوون"
            ) : (
              <>
                <Text style={styles.timeLtr}>{`${noted}/${total}`}</Text>
                {" منقط · "}
                <Text style={styles.timeLtr}>{String(confirmed)}</Text>
                {" مؤكد"}
              </>
            )}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const showInitialLoader = loading && tests.length === 0 && tab !== "create";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={openSidebar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
        >
          <Menu size={24} color={colors.text} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>الاختبارات</Text>
        <AdminTopBarAvatar
          currentUser={currentUser}
          onPress={() => navigation.navigate("AdminProfile")}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
          hitSlop={12}
        >
          <Bell size={24} color={colors.muted} pointerEvents="none" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[
            styles.tabCreate,
            tab === "create" && {
              backgroundColor: colorWithAlpha(colors.primary, 0.12),
            },
          ]}
          onPress={() => setTab("create")}
          accessibilityRole="button"
          accessibilityLabel="إنشاء اختبار"
        >
          <Plus size={20} color={colors.primary} pointerEvents="none" />
        </TouchableOpacity>
        {TABS.map((item) => {
          const active = tab === item.key;
          let count = null;
          if (item.key === "all") count = counts.all;
          if (item.key === "upcoming") count = counts.upcoming;
          if (item.key === "past") count = counts.past;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(item.key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {item.label}
              </Text>
              <View style={[styles.tabCount, active && styles.tabCountActive]}>
                <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {showInitialLoader ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + bottomGap }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadAll("refresh")}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          >
            {tab === "create" ? (
              <SectionCard title="إعلان اختبار جديد" subtitle="اختر الموسم والنوع ثم أعلن الاختبار">
                {activeSeasons.length === 0 ? (
                  <Text style={styles.emptyText}>
                    لا يوجد موسم نشط. أنشئ موسماً قبل إعلان اختبار.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.label}>الموسم</Text>
                    <View style={styles.chips}>
                      {activeSeasons.map((season) => {
                        const active = saisonId === season.id;
                        return (
                          <TouchableOpacity
                            key={season.id}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setSaisonId(season.id)}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {season.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={styles.label}>نوع الاختبار</Text>
                    <View style={styles.chips}>
                      {TEST_TYPES.map((item) => {
                        const active = testType === item.key;
                        return (
                          <TouchableOpacity
                            key={item.key}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setTestType(item.key)}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
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
                      placeholderTextColor={colors.placeholder}
                      value={title}
                      onChangeText={setTitle}
                      textAlign={textAlignStart}
                    />

                    {testType === "hifz" ? (
                      <>
                        <Text style={styles.label}>مقدار الحفظ</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="مثال: جزء عمّ — أو 10 صفحات"
                          placeholderTextColor={colors.placeholder}
                          value={quranQuantity}
                          onChangeText={(value) => {
                            setQuantityTouched(true);
                            setQuranQuantity(value);
                          }}
                          textAlign={textAlignStart}
                        />
                        {showQuantityError ? (
                          <Text style={styles.fieldError}>
                            مقدار الحفظ إلزامي لاختبار الحفظ
                          </Text>
                        ) : null}
                      </>
                    ) : null}

                    <Text style={styles.label}>التواريخ المقترحة</Text>
                    <View style={styles.chips}>
                      {[...proposedDates]
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((slot) => (
                        <View key={slot.date} style={styles.dateChip}>
                          <Text style={styles.dateChipText}>
                            {formatShortTestDate(slot.date) || slot.date}
                          </Text>
                          <Text style={[styles.dateChipText, styles.timeLtr]}>
                            {` · ${formatTestTime(slot.heure)}`}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              setDatesAttempted(true);
                              setProposedDates((prev) =>
                                prev.filter((item) => item.date !== slot.date)
                              );
                            }}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="حذف التاريخ"
                          >
                            <Ionicons name="close" size={14} color={colors.muted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={styles.dateAddBtn}
                      onPress={openDatePicker}
                    >
                      <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                      <Text style={styles.dateAddText}>إضافة تاريخ</Text>
                    </TouchableOpacity>
                    {iosPicker ? <IosDateTimePicker picker={iosPicker} /> : null}
                    {iosPicker ? (
                      <TouchableOpacity style={styles.dateDoneBtn} onPress={iosPicker.confirm}>
                        <Text style={styles.dateDoneText}>تم</Text>
                      </TouchableOpacity>
                    ) : null}
                    {slotError ? <Text style={styles.datesError}>{slotError}</Text> : null}
                    {showDatesError ? (
                      <Text style={styles.datesError}>أضف تاريخاً واحداً على الأقل</Text>
                    ) : null}

                    <TouchableOpacity
                      style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                      onPress={handleCreate}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Plus size={18} color="#fff" />
                          <Text style={styles.submitText}>إعلان الاختبار</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </SectionCard>
            ) : error && tests.length === 0 ? (
              <View style={styles.centerBlock}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => loadAll()}>
                  <Text style={styles.retryText}>إعادة المحاولة</Text>
                </TouchableOpacity>
              </View>
            ) : filteredTests.length === 0 ? (
              <View style={styles.centerBlock}>
                <Text style={styles.emptyTitle}>لا توجد اختبارات هنا</Text>
                <Text style={styles.emptyText}>{EMPTY_BY_TAB[tab] || EMPTY_BY_TAB.all}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => setTab("create")}>
                  <Text style={styles.retryText}>إنشاء اختبار</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {filteredTests.map(renderTestCard)}
              </>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      {messagesFab}
      {sidebar}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  tabs: {
    flexDirection: row,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 4,
  },
  tabCreate: {
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
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
  tabActive: { borderBottomColor: colors.primary },
  tabText: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  tabTextActive: { color: colors.primary, fontFamily: fonts.bold },
  tabCount: {
    minWidth: 20,
    height: 18,
    borderRadius: radii.pill,
    paddingHorizontal: 5,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountActive: { backgroundColor: colors.primarySoft },
  tabCountText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.muted,
  },
  tabCountTextActive: { color: colors.primary },
  scrollContent: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerBlock: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 24 },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    gap: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderStartWidth: 3,
  },
  listCardMuted: { opacity: 0.6 },
  cardTitleRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  statusWrap: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 12,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  cardMetaRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  cardMetaText: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  cardDate: {
    flexShrink: 0,
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  cardFootRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  cardFootText: {
    flexShrink: 0,
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  emptyTitle: {
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.bold,
    marginBottom: 6,
    ...rtlText,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: "center",
    lineHeight: 20,
    ...rtlText,
  },
  dateChip: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateChipText: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  timeLtr: { writingDirection: "ltr" },
  dateAddBtn: {
    flexDirection: row,
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginBottom: 10,
  },
  dateAddText: {
    fontSize: 14,
    color: colors.primary,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  dateDoneBtn: {
    alignSelf: "flex-start",
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateDoneText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  datesError: {
    color: colors.red,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginBottom: 14,
    ...rtlText,
  },
  fieldError: {
    color: colors.red,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: -8,
    marginBottom: 14,
    ...rtlText,
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginBottom: 12,
    ...rtlText,
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontFamily: fonts.bold, ...rtlText },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    marginBottom: 6,
    ...rtlText,
  },
  input: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.inputBg,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
    marginBottom: 14,
    ...rtlText,
  },
  chips: {
    flexDirection: row,
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  chipTextActive: { color: "#fff", fontFamily: fonts.semiBold },
  submitBtn: {
    width: "100%",
    paddingVertical: 14,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    alignItems: "center",
    flexDirection: row,
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: fonts.bold,
    ...rtlText,
  },
});
