import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Modal,
  Pressable,
} from "react-native";
import { pickDateTime, useIosDateTimePicker, IosDateTimePicker } from "../../lib/pickDateTime";
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Check } from "lucide-react-native";
import { rtlText, row, arrowBack, fonts } from "../../constants/rtl";
import { colors, radii, shadows } from "../../constants/theme";
import { SectionCard } from "../../components/ui";
import {
  getAllTestsAdmin,
  getTestInvitationsWithMembers,
  getTestDates,
  addTestDate,
  updateTestDateHeure,
  removeTestDate,
  recordTestResult,
  markResultsNotified,
  updateTestStatus,
  adminUpdateInvitation,
} from "../../lib/testsApi";
import {
  getTestDisplayStatus,
  INVITATION_STATUS,
  RESULT_SENT_LABEL,
  TEST_TYPE_LABELS,
  formatTestDate,
  formatShortTestDate,
  formatTestTime,
  casablancaTodayIso,
  addCalendarDays,
  isoToLocalDate,
} from "../../constants/tests";
import StatusBadge, { colorWithAlpha } from "../../components/tests/StatusBadge";

const NOTE_ERROR = "النقطة يجب أن تكون بين 0 و 20";
const STATUS_KEYS = ["invite", "confirme", "refuse", "note"];

function memberName(invitation) {
  const membre = invitation?.membre;
  const name = `${membre?.first_name || ""} ${membre?.last_name || ""}`.trim();
  return name || membre?.email || "عضو";
}

/** 0–20, demi-points compris. La virgule arabe est acceptée. */
function parseNote(raw) {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 20) return null;
  return value;
}

function formatNote(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
}

function savedNoteNumber(note) {
  if (note == null || note === "") return null;
  const n = Number(note);
  return Number.isFinite(n) ? n : null;
}

/** Brouillon comparé à la note enregistrée. La virgule reste un séparateur. */
function noteDraftState(draft, savedNote) {
  const trimmed = String(draft ?? "").trim();
  const parsed = parseNote(trimmed);
  const saved = savedNoteNumber(savedNote);
  const same =
    (trimmed === "" && saved == null) ||
    (parsed != null && saved != null && parsed === saved);
  return {
    parsed,
    same,
    dirty: trimmed !== "" && !same,
    valid: parsed != null,
    incomplete: /^\d+[.,]$/.test(trimmed),
  };
}

function isPlanned(test) {
  return test?.statut !== "termine" && test?.statut !== "annule";
}

/** Feuille basse : les insets du provider racine n'arrivent pas toujours dans un Modal Android. */
function MoveSheetBody({ onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.modalRoot}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 28 }]}>
        {children}
      </View>
    </View>
  );
}

function tallyOf(list) {
  const tally = { invite: 0, confirme: 0, refuse: 0, note: 0 };
  list.forEach((invitation) => {
    if (Object.prototype.hasOwnProperty.call(tally, invitation.statut)) {
      tally[invitation.statut] += 1;
    }
  });
  return tally;
}

export default function AdminTestDetailScreen({ navigation, route }) {
  const testId = route?.params?.testId || null;
  const insets = useSafeAreaInsets();

  const [test, setTest] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [proposedDates, setProposedDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const iosPicker = useIosDateTimePicker();
  const [dateError, setDateError] = useState("");
  const [drafts, setDrafts] = useState({});
  const [noteErrors, setNoteErrors] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [noteFlash, setNoteFlash] = useState({});
  const [noteFocusId, setNoteFocusId] = useState(null);
  const [sending, setSending] = useState(false);
  const [moveSheet, setMoveSheet] = useState(null);
  const [moveDate, setMoveDate] = useState("");
  const [moveSaving, setMoveSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(null);
  const closedByUser = useRef(false);

  const load = useCallback(
    async (mode = "load") => {
      if (!testId) {
        setError("معرّف الاختبار مفقود");
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      const [testsRes, invitesRes, datesRes] = await Promise.all([
        getAllTestsAdmin(),
        getTestInvitationsWithMembers(testId),
        getTestDates(testId),
      ]);
      if (!testsRes.ok) {
        setError(testsRes.error || "تعذر تحميل الاختبار");
        if (mode !== "refresh") setTest(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const found = (testsRes.tests || []).find((row) => row.id === testId) || null;
      if (!found) {
        setError("الاختبار غير موجود");
        setTest(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!invitesRes.ok) {
        setError(invitesRes.error || "تعذر تحميل الدعوات");
        setTest(found);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setTest(found);
      setInvitations(invitesRes.invitations || []);
      setProposedDates(datesRes.ok ? datesRes.dates || [] : []);
      setDateError(datesRes.ok ? "" : datesRes.error || "تعذر تحميل التواريخ");
      setError("");
      setLoading(false);
      setRefreshing(false);
    },
    [testId]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Première date au chargement. Un rafraîchissement conserve le choix
  // s'il existe encore, sinon retombe sur la première. Une fermeture
  // manuelle (✕ ou second tap) reste fermée tant que la liste n'est pas vide.
  useEffect(() => {
    const sorted = [...proposedDates].sort((a, b) =>
      String(a.date_proposee || "").localeCompare(String(b.date_proposee || ""))
    );
    if (sorted.length === 0) {
      closedByUser.current = false;
      setSelectedDate(null);
      return;
    }
    setSelectedDate((current) => {
      if (current && sorted.some((row) => row.date_proposee === current)) return current;
      if (current == null && closedByUser.current) return null;
      return sorted[0].date_proposee;
    });
  }, [proposedDates]);

  const counts = useMemo(() => tallyOf(invitations), [invitations]);

  // La date sélectionnée n'alimente que le bloc sous les chips, pas la liste.
  const dateMembers = useMemo(() => {
    if (!selectedDate) return [];
    return invitations.filter((invitation) => invitation.date_choisie === selectedDate);
  }, [invitations, selectedDate]);

  const visibleInvitations = useMemo(() => {
    if (statusFilter === "all") return invitations;
    return invitations.filter((invitation) => invitation.statut === statusFilter);
  }, [invitations, statusFilter]);

  const pendingSend = useMemo(
    () =>
      invitations.filter(
        (invitation) =>
          invitation.statut === "note" && !invitation.date_notification_resultat
      ),
    [invitations]
  );

  const notedCount = counts.note;
  const totalCount = invitations.length;
  const notedRatio = totalCount === 0 ? 0 : Math.round((notedCount / totalCount) * 100);

  const sortedDates = useMemo(
    () =>
      [...proposedDates].sort((a, b) =>
        String(a.date_proposee || "").localeCompare(String(b.date_proposee || ""))
      ),
    [proposedDates]
  );

  const applyMemberUpdate = async (invitation, payload) => {
    const result = await adminUpdateInvitation(invitation.id, payload);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error || "تعذر تحديث الدعوة");
      return false;
    }
    load();
    return true;
  };

  const closeMoveSheet = () => {
    if (moveSaving) return;
    setMoveSheet(null);
    setMoveDate("");
  };

  const openMoveSheet = (invitation, others) => {
    if (others.length === 0) {
      Alert.alert("تغيير الموعد", "لا توجد تواريخ أخرى");
      return;
    }
    setMoveDate("");
    setMoveSheet({ invitation, dates: others });
  };

  const confirmMove = async () => {
    if (!moveSheet?.invitation || !moveDate || moveSaving) return;
    setMoveSaving(true);
    const ok = await applyMemberUpdate(moveSheet.invitation, {
      statut: "confirme",
      dateChoisie: moveDate,
    });
    setMoveSaving(false);
    if (!ok) return;
    setMoveSheet(null);
    setMoveDate("");
  };

  const onMemberLongPress = (invitation) => {
    if (!isPlanned(test)) return;
    if (invitation.statut === "note") {
      Alert.alert("تنبيه", "لا يمكن تعديل عضو تم تنقيطه");
      return;
    }
    const others = sortedDates.filter((row) => row.date_proposee !== invitation.date_choisie);
    Alert.alert(memberName(invitation), undefined, [
      { text: "تغيير الموعد", onPress: () => openMoveSheet(invitation, others) },
      {
        text: "تسجيل كمعتذر",
        onPress: () => applyMemberUpdate(invitation, { statut: "refuse", dateChoisie: null }),
      },
      { text: "إلغاء", style: "cancel" },
    ]);
  };

  const saveNote = async (invitation) => {
    if (savingId) return;
    const raw = drafts[invitation.id] ?? formatNote(invitation.note);
    const { parsed, same } = noteDraftState(raw, invitation.note);
    if (same || String(raw ?? "").trim() === "") return;
    if (parsed == null) {
      setNoteErrors((prev) => ({ ...prev, [invitation.id]: NOTE_ERROR }));
      return;
    }
    setNoteErrors((prev) => {
      const next = { ...prev };
      delete next[invitation.id];
      return next;
    });
    setSavingId(invitation.id);
    const result = await recordTestResult({ invitationId: invitation.id, note: parsed });
    setSavingId(null);
    if (!result.ok) {
      setNoteErrors((prev) => ({ ...prev, [invitation.id]: result.error }));
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[invitation.id];
      return next;
    });
    setInvitations((prev) =>
      prev.map((row) =>
        row.id === invitation.id
          ? { ...row, note: parsed, statut: row.statut === "confirme" ? "note" : row.statut }
          : row
      )
    );
    setNoteFlash((prev) => ({ ...prev, [invitation.id]: true }));
    load();
  };

  const confirmSend = () => {
    if (pendingSend.length === 0 || sending) return;
    Alert.alert(
      "إرسال النتائج",
      `سيتم إرسال ${pendingSend.length} نتيجة إلى الأعضاء. هل تؤكد؟`,
      [
        { text: "تراجع", style: "cancel" },
        {
          text: "إرسال",
          onPress: async () => {
            setSending(true);
            const result = await markResultsNotified(testId);
            setSending(false);
            if (!result.ok) {
              Alert.alert("تنبيه", result.error);
              return;
            }
            Alert.alert("تم الإرسال", `أُرسلت ${result.count} نتيجة`);
            load();
          },
        },
      ]
    );
  };

  const tomorrowIso = addCalendarDays(casablancaTodayIso(), 1);

  const applyNewSlot = async () => {
    setDateError("");
    const slot = await pickDateTime({
      minimumDate: isoToLocalDate(tomorrowIso),
      initialDate: isoToLocalDate(tomorrowIso),
    });
    if (!slot) return;
    const result = await addTestDate(testId, slot.date, slot.heure);
    if (!result.ok) {
      setDateError(result.error);
      return;
    }
    setDateError("");
    load();
  };

  const applyEditedTime = async (row) => {
    const hm = formatTestTime(row.heure_proposee);
    const base = new Date();
    if (hm) {
      const [hours, minutes] = hm.split(":").map(Number);
      base.setHours(hours, minutes, 0, 0);
    }
    setDateError("");
    const slot = await pickDateTime({ initialDate: base, timeOnly: true });
    if (!slot) return;
    const result = await updateTestDateHeure(row.id, slot.heure);
    if (!result.ok) {
      setDateError(result.error);
      return;
    }
    setDateError("");
    load();
  };

  const deleteDate = async (row) => {
    const result = await removeTestDate(row.id);
    if (!result.ok) {
      setDateError(result.error);
      return;
    }
    setDateError("");
    load();
  };

  const onDateLongPress = (row) => {
    const label = formatShortTestDate(row.date_proposee) || row.date_proposee;
    Alert.alert(label, undefined, [
      { text: "تعديل الوقت", onPress: () => applyEditedTime(row) },
      { text: "حذف", style: "destructive", onPress: () => deleteDate(row) },
      { text: "إلغاء", style: "cancel" },
    ]);
  };

  const toggleDate = (iso) => {
    setSelectedDate((current) => {
      if (current === iso) {
        closedByUser.current = true;
        return null;
      }
      closedByUser.current = false;
      return iso;
    });
  };

  const closeDatePanel = () => {
    closedByUser.current = true;
    setSelectedDate(null);
  };

  const runStatusChange = async (statut) => {
    if (statusBusy) return;
    setStatusBusy(statut);
    const result = await updateTestStatus({ testId, statut });
    setStatusBusy(null);
    if (!result.ok) Alert.alert("خطأ", result.error);
    load();
  };

  const confirmCancel = () => {
    if (statusBusy) return;
    Alert.alert("إلغاء الاختبار", `هل تريد إلغاء «${test?.titre || "اختبار"}»؟`, [
      { text: "تراجع", style: "cancel" },
      {
        text: "إلغاء",
        style: "destructive",
        onPress: () => runStatusChange("annule"),
      },
    ]);
  };

  const confirmComplete = () => {
    if (statusBusy) return;
    Alert.alert("تعليم كمنجز", `هل تم إنجاز «${test?.titre || "اختبار"}»؟`, [
      { text: "تراجع", style: "cancel" },
      {
        text: "تأكيد",
        onPress: () => runStatusChange("termine"),
      },
    ]);
  };

  const displayStatus = getTestDisplayStatus(test, {
    dates: proposedDates,
    invitations,
  });
  const announced = formatTestDate(test?.created_at);
  const summaryLine = [
    TEST_TYPE_LABELS[test?.type] || "",
    String(test?.quran_quantity || "").trim(),
    test?.saison?.name || "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <Ionicons name={arrowBack} size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1} ellipsizeMode="tail">
          {test?.titre || "تفاصيل الاختبار"}
        </Text>
        {isPlanned(test) ? (
          <View style={styles.topBarActions}>
            <TouchableOpacity
              style={[
                styles.topPill,
                { backgroundColor: colorWithAlpha(colors.primary, 0.2) },
                statusBusy && styles.topPillDisabled,
              ]}
              onPress={confirmComplete}
              disabled={!!statusBusy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="تم"
            >
              {statusBusy === "termine" ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.topPillText, { color: colors.primary }]}>تم</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.topPill,
                { backgroundColor: colorWithAlpha(colors.red, 0.2) },
                statusBusy && styles.topPillDisabled,
              ]}
              onPress={confirmCancel}
              disabled={!!statusBusy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="إلغاء"
            >
              {statusBusy === "annule" ? (
                <ActivityIndicator size="small" color={colors.red} />
              ) : (
                <Text style={[styles.topPillText, { color: colors.red }]}>إلغاء</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {loading && !test ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error && !test ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: 16 + Math.max(insets.bottom, 8) },
            ]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load("refresh")}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          >
            <View style={styles.headerCard}>
              {isPlanned(test) && displayStatus.allDatesPassed ? (
                <Text style={styles.datesPassedHint}>
                  انتهت جميع المواعيد، يمكنك إنهاء الاختبار
                </Text>
              ) : null}
              <View style={styles.titleRow}>
                <Text style={styles.headerTitle} numberOfLines={2}>
                  {test?.titre || "اختبار"}
                </Text>
                <StatusBadge label={displayStatus.label} color={displayStatus.color} />
              </View>
              {summaryLine ? (
                <Text style={styles.summaryLine} numberOfLines={2}>
                  {summaryLine}
                </Text>
              ) : null}
              <Text style={styles.announcedLine}>أُعلن في {announced || "—"}</Text>

              <View style={styles.separator} />

              <View style={styles.counterRow}>
                {STATUS_KEYS.map((key) => {
                  const meta = INVITATION_STATUS[key];
                  const active = statusFilter === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.counter}
                      onPress={() => setStatusFilter(key)}
                      accessibilityRole="button"
                      accessibilityLabel={meta.label}
                    >
                      <Text style={[styles.counterValue, { color: meta.color }]}>
                        {counts[key]}
                      </Text>
                      <Text
                        style={[styles.counterLabel, active && { color: meta.color }]}
                        numberOfLines={1}
                      >
                        {meta.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.track}>
                <View style={[styles.fill, { width: `${notedRatio}%` }]} />
              </View>
              <Text style={styles.progressLabel}>
                {notedCount} / {totalCount} منقط
              </Text>
            </View>

            <SectionCard title="توزيع الأعضاء حسب التواريخ المقترحة">
            {dateError ? <Text style={styles.fieldError}>{dateError}</Text> : null}
            {sortedDates.length === 0 && !isPlanned(test) ? (
              <Text style={styles.emptyText}>لا توجد تواريخ مقترحة</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dateStrip}
              >
                {sortedDates.map((row) => {
                  const chosenCount = invitations.filter(
                    (invitation) => invitation.date_choisie === row.date_proposee
                  ).length;
                  const active = selectedDate === row.date_proposee;
                  const short = formatShortTestDate(row.date_proposee) || row.date_proposee;
                  const time = formatTestTime(row.heure_proposee);
                  const labelStyle = [styles.dateChipText, active && styles.chipTextActive];
                  return (
                    <TouchableOpacity
                      key={row.id}
                      style={[styles.dateChip, active && styles.chipActive]}
                      onPress={() => toggleDate(row.date_proposee)}
                      onLongPress={() => onDateLongPress(row)}
                      accessibilityRole="button"
                      accessibilityLabel={time ? `${short} ${time}` : short}
                    >
                      <Text style={labelStyle}>{short}</Text>
                      {time ? (
                        <Text style={[...labelStyle, styles.timeLtr]}>{` · ${time}`}</Text>
                      ) : null}
                      <Text style={labelStyle}>{` · ${chosenCount}`}</Text>
                    </TouchableOpacity>
                  );
                })}
                {isPlanned(test) ? (
                  <TouchableOpacity
                    style={styles.dateChip}
                    onPress={applyNewSlot}
                    accessibilityRole="button"
                    accessibilityLabel="إضافة تاريخ"
                  >
                    <Text style={styles.plusText}>+</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            )}
            {selectedDate ? (
              <View style={styles.datePanel}>
                {/* Pas de titre « أعضاء يوم … » : la chip sélectionnée suffit. */}
                <View style={styles.datePanelHead}>
                  <TouchableOpacity
                    onPress={closeDatePanel}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="إغلاق"
                  >
                    <Ionicons name="close" size={16} color={colors.muted} />
                  </TouchableOpacity>
                </View>
                {isPlanned(test) &&
                dateMembers.some((invitation) => invitation.statut !== "note") ? (
                  <Text style={styles.longPressHint}>
                    اضغط مطولاً على اسم العضو إذا أردت تغيير موعد اختباره
                  </Text>
                ) : null}
                {dateMembers.length === 0 ? (
                  <Text style={styles.emptyText}>لم يختر أي عضو هذا التاريخ بعد</Text>
                ) : (
                  dateMembers.map((invitation, index) => {
                    const sent = !!invitation.date_notification_resultat;
                    const canEdit =
                      (invitation.statut === "confirme" || invitation.statut === "note") &&
                      !sent;
                    const draft =
                      drafts[invitation.id] != null
                        ? drafts[invitation.id]
                        : formatNote(invitation.note);
                    const fieldError = noteErrors[invitation.id];
                    const draftState = noteDraftState(draft, invitation.note);
                    const saving = savingId === invitation.id;
                    const canSave = draftState.dirty && draftState.valid && !saving;
                    const inlineError =
                      fieldError ||
                      (draftState.dirty && !draftState.valid && !draftState.incomplete
                        ? NOTE_ERROR
                        : "");
                    const flashed = !!noteFlash[invitation.id];
                    const last = index === dateMembers.length - 1;
                    return (
                      <View
                        key={invitation.id}
                        style={[styles.dateMemberLine, !last && styles.memberDivider]}
                      >
                        <View style={styles.dateMemberRow}>
                          <TouchableOpacity
                            style={styles.memberPress}
                            onLongPress={
                              isPlanned(test) ? () => onMemberLongPress(invitation) : undefined
                            }
                            activeOpacity={0.7}
                            accessibilityRole="button"
                          >
                            <Text style={styles.memberName} numberOfLines={1}>
                              {memberName(invitation)}
                            </Text>
                          </TouchableOpacity>
                          {sent ? (
                            <View style={styles.noteControl}>
                              <Text style={styles.sentScore}>
                                {formatNote(invitation.note) || "—"} / 20
                              </Text>
                              <Text style={styles.sentLabel}>{RESULT_SENT_LABEL.label}</Text>
                            </View>
                          ) : canEdit ? (
                            <View style={styles.noteControl}>
                              {saving ? (
                                <View style={styles.noteLeading}>
                                  <ActivityIndicator color={colors.primary} size="small" />
                                </View>
                              ) : canSave ? (
                                <TouchableOpacity
                                  style={styles.noteSaveBtn}
                                  onPress={() => saveNote(invitation)}
                                  accessibilityRole="button"
                                  accessibilityLabel="حفظ"
                                >
                                  <Check size={16} color="#fff" strokeWidth={2.5} />
                                </TouchableOpacity>
                              ) : flashed && !inlineError ? (
                                <View style={styles.noteLeading}>
                                  <Check size={16} color={colors.primary} strokeWidth={2.5} />
                                </View>
                              ) : null}
                              <TextInput
                                style={[
                                  styles.noteField,
                                  noteFocusId === invitation.id &&
                                    !inlineError &&
                                    styles.noteFieldFocus,
                                  inlineError && styles.noteFieldError,
                                ]}
                                value={draft}
                                onChangeText={(value) => {
                                  setDrafts((prev) => ({ ...prev, [invitation.id]: value }));
                                  if (noteDraftState(value, invitation.note).dirty) {
                                    setNoteFlash((prev) => {
                                      if (!prev[invitation.id]) return prev;
                                      const next = { ...prev };
                                      delete next[invitation.id];
                                      return next;
                                    });
                                  }
                                  if (fieldError) {
                                    setNoteErrors((prev) => {
                                      const next = { ...prev };
                                      delete next[invitation.id];
                                      return next;
                                    });
                                  }
                                }}
                                onFocus={() => setNoteFocusId(invitation.id)}
                                onBlur={() =>
                                  setNoteFocusId((current) =>
                                    current === invitation.id ? null : current
                                  )
                                }
                                editable={!saving}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                onSubmitEditing={() => saveNote(invitation)}
                                placeholder="—"
                                placeholderTextColor={colors.placeholder}
                                textAlign="center"
                              />
                              <Text style={styles.noteSuffix}>/ 20</Text>
                            </View>
                          ) : null}
                        </View>
                        {inlineError ? <Text style={styles.fieldError}>{inlineError}</Text> : null}
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
            {iosPicker ? <IosDateTimePicker picker={iosPicker} /> : null}
            {iosPicker ? (
              <TouchableOpacity style={styles.dateDoneBtn} onPress={iosPicker.confirm}>
                <Text style={styles.dateDoneText}>تم</Text>
              </TouchableOpacity>
            ) : null}
            </SectionCard>

            <SectionCard title="الأعضاء">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterStrip}
            >
              <TouchableOpacity
                style={[styles.filterChip, statusFilter === "all" && styles.chipActive]}
                onPress={() => setStatusFilter("all")}
              >
                <Text
                  style={[styles.filterChipText, statusFilter === "all" && styles.chipTextActive]}
                >
                  الكل {invitations.length}
                </Text>
              </TouchableOpacity>
              {STATUS_KEYS.map((key) => {
                const meta = INVITATION_STATUS[key];
                const active = statusFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.filterChip, active && styles.chipActive]}
                    onPress={() => setStatusFilter(key)}
                  >
                    <Text style={[styles.filterChipText, active && styles.chipTextActive]}>
                      {meta.label} {counts[key]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.membersList}>
              {visibleInvitations.length === 0 ? (
                <Text style={styles.emptyText}>لا توجد دعوات لهذا الاختبار</Text>
              ) : (
                visibleInvitations.map((invitation, index) => {
                  const sent = !!invitation.date_notification_resultat;
                  const inviteStatus =
                    INVITATION_STATUS[invitation.statut] || INVITATION_STATUS.invite;
                  const last = index === visibleInvitations.length - 1;
                  const chosenLabel = invitation.date_choisie
                    ? formatTestDate(invitation.date_choisie)
                    : "";
                  const noteLabel =
                    invitation.note == null ? "" : `${formatNote(invitation.note)}/20`;
                  return (
                    <View
                      key={invitation.id}
                      style={[styles.memberLine, !last && styles.memberDivider]}
                    >
                      <View style={styles.memberTop}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {memberName(invitation)}
                        </Text>
                        <Text
                          style={[styles.memberStatus, { color: inviteStatus.color }]}
                          numberOfLines={1}
                        >
                          {inviteStatus.label}
                          {sent ? (
                            <Text style={{ color: RESULT_SENT_LABEL.color }}>
                              {` · ${RESULT_SENT_LABEL.label}`}
                            </Text>
                          ) : null}
                        </Text>
                      </View>
                      {chosenLabel || noteLabel ? (
                        <View style={styles.memberSub}>
                          {chosenLabel ? (
                            <Text style={styles.memberDate} numberOfLines={1}>
                              {chosenLabel}
                            </Text>
                          ) : (
                            <View style={styles.flex} />
                          )}
                          {noteLabel ? <Text style={styles.sentNote}>{noteLabel}</Text> : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
            </SectionCard>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (pendingSend.length === 0 || sending) && styles.submitBtnDisabled,
              ]}
              onPress={pendingSend.length === 0 || sending ? undefined : confirmSend}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendBtnText}>
                  إرسال النتائج ({pendingSend.length})
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
      <Modal
        visible={Boolean(moveSheet)}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeMoveSheet}
      >
        <SafeAreaProvider style={styles.modalRoot}>
          <MoveSheetBody onClose={closeMoveSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>تغيير الموعد</Text>
            <View style={styles.moveChips}>
              {(moveSheet?.dates || []).map((row) => {
                const iso = row.date_proposee;
                const time = formatTestTime(row.heure_proposee);
                const active = moveDate === iso;
                const labelStyle = [styles.dateChipText, active && styles.chipTextActive];
                const short = formatShortTestDate(iso) || iso;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[styles.dateChip, active && styles.chipActive]}
                    onPress={() => setMoveDate(iso)}
                  >
                    <Text style={labelStyle}>{short}</Text>
                    {time ? (
                      <Text style={[...labelStyle, styles.timeLtr]}>{` · ${time}`}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, (!moveDate || moveSaving) && styles.submitBtnDisabled]}
              disabled={!moveDate || moveSaving}
              onPress={confirmMove}
            >
              {moveSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendBtnText}>تأكيد</Text>
              )}
            </TouchableOpacity>
          </MoveSheetBody>
        </SafeAreaProvider>
      </Modal>
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
    flexShrink: 1,
    minWidth: 0,
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  topBarActions: {
    flexDirection: row,
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
  },
  topPill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  topPillText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  topPillDisabled: { opacity: 0.5 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scroll: { padding: 16, gap: 10 },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  datesPassedHint: {
    backgroundColor: colorWithAlpha(colors.gold, 0.12),
    borderRadius: radii.md,
    padding: 10,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.text,
    ...rtlText,
  },
  titleRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    color: colors.text,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  summaryLine: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  announcedLine: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  separator: { height: 1, backgroundColor: colors.border },
  counterRow: { flexDirection: row, alignItems: "flex-start" },
  counter: { flex: 1, alignItems: "center", gap: 2 },
  counterValue: { fontSize: 18, fontFamily: fonts.bold },
  counterLabel: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  track: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  progressLabel: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  dateStrip: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  dateChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
  },
  dateChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  timeLtr: { writingDirection: "ltr" },
  plusText: {
    fontSize: 16,
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  dateDoneBtn: { alignSelf: "flex-start", marginTop: 8 },
  dateDoneText: { color: colors.primary, fontFamily: fonts.bold, ...rtlText },
  datePanel: { marginTop: 12, gap: 4 },
  datePanelHead: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  longPressHint: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  modalRoot: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 16,
    gap: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  sheetTitle: {
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  moveChips: {
    flexDirection: row,
    flexWrap: "wrap",
    gap: 8,
  },
  dateMemberLine: { minHeight: 52, justifyContent: "center", gap: 2 },
  dateMemberRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    minHeight: 52,
  },
  noteControl: {
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
  },
  noteLeading: {
    width: 28,
    height: 28,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  noteSaveBtn: {
    width: 28,
    height: 28,
    marginRight: 8,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  noteField: {
    width: 44,
    height: 32,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.border,
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.bold,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  noteFieldFocus: { borderBottomColor: colors.primary },
  noteFieldError: { borderBottomColor: colors.red },
  noteSuffix: {
    marginLeft: 4,
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  sentScore: {
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.bold,
    writingDirection: "ltr",
  },
  sentLabel: {
    marginLeft: 8,
    fontSize: 12,
    color: RESULT_SENT_LABEL.color,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  sentNote: {
    fontSize: 14,
    color: colors.text,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  filterStrip: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  chipTextActive: { color: "#fff", fontFamily: fonts.semiBold },
  membersList: { marginTop: 12 },
  memberLine: { paddingVertical: 10, gap: 4 },
  memberDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memberTop: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  memberPress: { flex: 1, minWidth: 0 },
  memberName: {
    fontSize: 14,
    color: colors.text,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  memberStatus: {
    fontSize: 12,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  memberSub: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  memberDate: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  fieldError: {
    fontSize: 12,
    color: colors.red,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  submitBtnDisabled: { opacity: 0.5 },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
    paddingVertical: 8,
    ...rtlText,
  },
  errorText: {
    color: colors.red,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginBottom: 8,
    ...rtlText,
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontFamily: fonts.bold, ...rtlText },
});
