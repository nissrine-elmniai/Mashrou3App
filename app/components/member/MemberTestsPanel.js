import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  findNodeHandle,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import { fonts, row, rtlText } from "../../constants/rtl";
import {
  TEST_TYPE_LABELS,
  formatTestDate,
  formatShortTestDate,
  formatTestTime,
  casablancaTodayIso,
  addCalendarDays,
} from "../../constants/tests";
import { SectionTitle } from "../ui";
import { colorWithAlpha } from "../tests/StatusBadge";
import { getMyTestInvitations, respondToInvitation } from "../../lib/testsApi";

/** Partie haute de MemberBottomTabBar, hors marge basse. */
const TAB_BAR_BODY = 52;

/** Feuille basse : les insets du provider racine n'arrivent pas toujours dans un Modal Android. */
function TestSheetBody({ onClose, children }) {
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

function scoreLabel(note) {
  const value = Number(note);
  if (!Number.isFinite(value)) return "";
  return String(value);
}

/** Dernière date proposée du test, ou chaîne vide. */
function lastProposedIso(test) {
  const dates = Array.isArray(test?.test_dates) ? test.test_dates : [];
  const isos = dates
    .map((row) => String(row?.date_proposee || "").slice(0, 10))
    .filter((iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso));
  isos.sort();
  return isos[isos.length - 1] || "";
}

/**
 * Délai affiché au membre.
 * reply = veille de la dernière date proposée (invite et refus encore ouvert).
 * edit = veille de la date choisie (confirmation).
 */
function DeadlineHint({ kind, iso, today }) {
  const eve = addCalendarDays(iso, -1);
  if (!eve) return null;
  const lastDay = eve === today;
  if (lastDay) {
    return (
      <Text style={[styles.deadlineHint, styles.deadlineToday]}>
        {kind === "edit" ? "تنتهي إمكانية تعديل الجواب اليوم" : "تنتهي إمكانية الجواب اليوم"}
      </Text>
    );
  }
  const lead = kind === "edit" ? "يمكنك تعديل جوابك إلى غاية يوم " : "يمكنك الجواب إلى غاية يوم ";
  return (
    <Text style={styles.deadlineHint}>
      {lead}
      <Text style={styles.timeLtr}>{formatTestDate(eve)}</Text>
    </Text>
  );
}

/** Réponse encore modifiable : veille de la date choisie, ou refus sans date. */
function canRevise(invitation, today) {
  const statut = invitation?.statut;
  if (statut !== "confirme" && statut !== "refuse") return false;
  const chosen = invitation?.date_choisie || "";
  if (!chosen) return statut === "refuse";
  return chosen > today;
}

/** Refus masqué : test terminé, ou plus aucune date proposée à partir de demain. */
function hideFinishedRefusal(invitation, today) {
  if (invitation?.statut !== "refuse") return false;
  if (invitation.test?.statut === "termine") return true;
  const tomorrow = addCalendarDays(today, 1);
  const dates = Array.isArray(invitation.test?.test_dates) ? invitation.test.test_dates : [];
  const stillOpen =
    Boolean(tomorrow) &&
    dates.some((row) => row?.date_proposee && row.date_proposee >= tomorrow);
  return !stillOpen;
}

function sectionOf(invitation, today) {
  const statut = invitation?.statut;
  if (statut === "invite") return "pending";
  if (statut === "confirme" && invitation?.date_choisie && invitation.date_choisie >= today) {
    return "upcoming";
  }
  if (statut === "refuse") {
    return hideFinishedRefusal(invitation, today) ? null : "upcoming";
  }
  return "past";
}

export default function MemberTestsPanel({ invitationId = null, onInviteCount }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const cardRefs = useRef({});
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");

  const today = casablancaTodayIso();

  const load = useCallback(async (mode = "load") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    const res = await getMyTestInvitations();
    if (!res.ok) {
      setError(res.error || "تعذر تحميل الاختبارات");
      if (mode !== "refresh") setInvitations([]);
    } else {
      setError("");
      const rows = res.invitations || [];
      setInvitations(rows);
      onInviteCount?.(rows.filter((row) => row.statut === "invite").length);
    }
    setLoading(false);
    setRefreshing(false);
  }, [onInviteCount]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const grouped = useMemo(() => {
    const pending = [];
    const upcoming = [];
    const past = [];
    invitations.forEach((invitation) => {
      const key = sectionOf(invitation, today);
      if (key === "pending") pending.push(invitation);
      else if (key === "upcoming") upcoming.push(invitation);
      else if (key === "past") past.push(invitation);
    });
    return [
      { key: "pending", title: "بانتظار جوابك", items: pending },
      { key: "upcoming", title: "اختبارات قادمة", items: upcoming },
      { key: "past", title: "اختبارات منجزة", items: past },
    ].filter((section) => section.items.length > 0);
  }, [invitations, today]);

  useEffect(() => {
    if (!invitationId || loading) return undefined;
    const node = cardRefs.current[invitationId];
    const content = contentRef.current;
    const scroller = scrollRef.current;
    const relative = content ? findNodeHandle(content) : null;
    if (!node || !scroller || !relative) return undefined;
    const timer = setTimeout(() => {
      node.measureLayout(
        relative,
        (_x, y) => scroller.scrollTo({ y: Math.max(0, y - 12), animated: true }),
        () => {}
      );
    }, 50);
    return () => clearTimeout(timer);
  }, [invitationId, loading, invitations]);

  const openSheet = (invitation, mode) => {
    const future = (invitation.test?.test_dates || [])
      .filter((row) => row.date_proposee && row.date_proposee > today)
      .sort((a, b) => String(a.date_proposee).localeCompare(String(b.date_proposee)));
    const current = invitation.date_choisie;
    setSelectedDate(
      current && future.some((row) => row.date_proposee === current) ? current : ""
    );
    setSheet({ invitation, mode, future });
  };

  const closeSheet = () => {
    if (saving) return;
    setSheet(null);
    setSelectedDate("");
  };

  const submitResponse = async (invitation, statut, dateChoisie) => {
    setSaving(true);
    const result = await respondToInvitation({
      invitationId: invitation.id,
      statut,
      dateChoisie,
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return;
    }
    setSheet(null);
    setSelectedDate("");
    load();
  };

  const confirmDecline = (invitation) => {
    Alert.alert("اعتذار", "هل تريد الاعتذار عن هذا الاختبار؟", [
      { text: "تراجع", style: "cancel" },
      {
        text: "اعتذار",
        style: "destructive",
        onPress: () => submitResponse(invitation, "refuse", null),
      },
    ]);
  };

  const renderCard = (invitation, sectionKey) => {
    const test = invitation.test || {};
    const typeLabel = TEST_TYPE_LABELS[test.type] || "اختبار";
    const quantity = String(test.quran_quantity || "").trim();
    const highlighted = invitationId && invitation.id === invitationId;
    const chosenDate = invitation.date_choisie ? formatTestDate(invitation.date_choisie) : "";
    const chosenTime = formatTestTime(
      (test.test_dates || []).find((row) => row.date_proposee === invitation.date_choisie)
        ?.heure_proposee
    );
    const dateTime = [chosenDate, chosenTime].filter(Boolean).join(" · ");
    const replyUntil = lastProposedIso(test);
    const resultSent = Boolean(invitation.date_notification_resultat);
    const score = invitation.statut === "note" && resultSent ? scoreLabel(invitation.note) : "";
    const showScore = Boolean(score);
    const revise = canRevise(invitation, today);
    const openRefusal = invitation.statut === "refuse";
    const waitingGrade =
      sectionKey === "past" &&
      invitation.statut === "confirme" &&
      invitation.date_choisie &&
      invitation.date_choisie < today;
    const detailParts = [];
    if (showScore) detailParts.push(typeLabel);
    if (quantity) detailParts.push(quantity);
    let statusLabel = "";
    let statusColor = colors.muted;
    if (openRefusal) {
      statusLabel = "اعتذرت عن هذا الاختبار";
      statusColor = colors.red;
    } else if (invitation.statut === "note" && !resultSent) {
      statusLabel = "في انتظار إعلان النتيجة";
    } else if (waitingGrade) {
      statusLabel = "في انتظار التنقيط";
    }
    const showEdit = revise || openRefusal;
    const showReply = invitation.statut === "invite";
    const showFooter = Boolean(statusLabel) || showEdit || showReply;

    return (
      <View
        key={invitation.id}
        ref={(node) => {
          cardRefs.current[invitation.id] = node;
        }}
        style={[styles.card, highlighted && styles.cardHighlight]}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {test.titre || typeLabel}
          </Text>
          {showScore ? (
            <Text style={styles.score}>{`${score}/20`}</Text>
          ) : (
            <Text style={styles.typeAside}>{typeLabel}</Text>
          )}
        </View>
        {detailParts.length > 0 || dateTime ? (
          <Text style={styles.meta}>
            {detailParts.join(" · ")}
            {detailParts.length > 0 && dateTime ? " · " : ""}
            {dateTime ? <Text style={styles.timeLtr}>{dateTime}</Text> : null}
          </Text>
        ) : null}
        {invitation.statut === "invite" && replyUntil ? (
          <DeadlineHint kind="reply" iso={replyUntil} today={today} />
        ) : null}
        {invitation.statut === "confirme" && revise && invitation.date_choisie ? (
          <DeadlineHint kind="edit" iso={invitation.date_choisie} today={today} />
        ) : null}

        {showFooter ? (
          <View style={styles.cardFooter}>
            {statusLabel ? (
              <Text style={[styles.statusLine, { color: statusColor }]}>{statusLabel}</Text>
            ) : (
              <View />
            )}
            {showReply ? (
              <View style={styles.tintRow}>
                <TouchableOpacity
                  style={[styles.tintBtn, { backgroundColor: colorWithAlpha(colors.primary, 0.12) }]}
                  onPress={() => openSheet(invitation, "confirm")}
                >
                  <Text style={[styles.tintBtnText, { color: colors.primary }]}>تأكيد</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tintBtn, { backgroundColor: colorWithAlpha(colors.red, 0.12) }]}
                  onPress={() => confirmDecline(invitation)}
                >
                  <Text style={[styles.tintBtnText, { color: colors.red }]}>اعتذار</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {showEdit ? (
              <TouchableOpacity
                hitSlop={10}
                onPress={() => openSheet(invitation, "edit")}
              >
                <Text style={styles.linkText}>تعديل الجواب</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {openRefusal && replyUntil ? (
          <DeadlineHint kind="reply" iso={replyUntil} today={today} />
        ) : null}
      </View>
    );
  };

  if (loading && invitations.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_BODY + Math.max(insets.bottom, 16) + 88 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load("refresh")}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {error ? (
          <View style={styles.centerBlock}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => load()}>
              <Text style={styles.primaryBtnText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : grouped.length === 0 ? (
          <View style={styles.centerBlock}>
            <Text style={styles.emptyText}>لا توجد اختبارات حالياً</Text>
          </View>
        ) : (
          <View ref={contentRef} style={styles.sections}>
            {grouped.map((section) => (
              <View key={section.key}>
                <SectionTitle title={section.title} lineStyle={styles.sectionRule} />
                <View style={styles.cardList}>
                  {section.items.map((invitation) => renderCard(invitation, section.key))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={Boolean(sheet)}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeSheet}
      >
        <SafeAreaProvider style={styles.modalRoot}>
          <TestSheetBody onClose={closeSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>اختر الموعد المناسب لك لاجتياز الاختبار</Text>
          {sheet && sheet.future.length === 0 ? (
            <Text style={styles.emptyText}>لا توجد تواريخ متاحة، تواصل مع الإدارة</Text>
          ) : (
            <View style={styles.chips}>
              {(sheet?.future || []).map((row) => {
                const iso = row.date_proposee;
                const time = formatTestTime(row.heure_proposee);
                const active = selectedDate === iso;
                const labelStyle = [styles.chipText, active && styles.chipTextActive];
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setSelectedDate(iso)}
                  >
                    <Text style={labelStyle}>{formatShortTestDate(iso) || iso}</Text>
                    {time ? (
                      <Text style={[...labelStyle, styles.timeLtr]}>{` · ${time}`}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {selectedDate ? (
            <DeadlineHint kind="edit" iso={selectedDate} today={today} />
          ) : null}
          <TouchableOpacity
            style={[styles.primaryBtn, styles.sheetBtn, (!selectedDate || saving) && styles.btnDisabled]}
            disabled={!selectedDate || saving}
            onPress={() => submitResponse(sheet.invitation, "confirme", selectedDate)}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>تأكيد الموعد</Text>
            )}
          </TouchableOpacity>
          {sheet?.mode === "edit" ? (
            <TouchableOpacity
              style={[styles.ghostBtn, styles.sheetBtn]}
              onPress={() => confirmDecline(sheet.invitation)}
            >
              <Ionicons name="close" size={16} color={colors.red} />
              <Text style={styles.ghostBtnText}>اعتذار</Text>
            </TouchableOpacity>
          ) : null}
          </TestSheetBody>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16 },
  sections: { gap: 24 },
  sectionRule: { marginBottom: 12 },
  cardList: { gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerBlock: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  cardHighlight: { borderColor: colors.primary, borderWidth: 1.5 },
  cardTop: {
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
  score: {
    flexShrink: 0,
    fontSize: 18,
    color: colors.primary,
    fontFamily: fonts.bold,
    writingDirection: "ltr",
  },
  typeAside: {
    flexShrink: 0,
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  deadlineHint: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  deadlineToday: { color: colors.gold },
  statusLine: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.medium,
    ...rtlText,
  },
  cardFooter: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  tintRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  tintBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tintBtnText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  linkText: {
    fontSize: 13,
    color: colors.gold,
    fontFamily: fonts.semiBold,
    textDecorationLine: "underline",
    ...rtlText,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  ghostBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: row,
    gap: 6,
    paddingHorizontal: 12,
  },
  ghostBtnText: {
    color: colors.red,
    fontSize: 14,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  btnDisabled: { opacity: 0.5 },
  errorText: {
    color: colors.red,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginBottom: 12,
    ...rtlText,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "center",
    ...rtlText,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalRoot: { flex: 1 },
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
  chips: { flexDirection: row, flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: row,
    alignItems: "center",
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
  timeLtr: { writingDirection: "ltr" },
  sheetBtn: { flex: 0, width: "100%" },
});
