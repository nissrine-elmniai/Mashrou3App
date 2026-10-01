import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { rtlText, row, arrowBack, textAlignStart } from "../../constants/rtl";
import {
  getAllTestsAdmin,
  getTestCollecte,
  getTestInvitationsWithMembers,
  recordTestResult,
  markResultsNotified,
  TEST_TYPE_LABELS,
} from "../../lib/testsApi";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  border: "#E0E0E0",
};

const STATUT_LABELS = {
  invite: "مدعو",
  confirme: "مؤكد",
  refuse: "معتذر",
  note: "منقط",
};

const TEST_STATUT_LABELS = {
  planifie: "قادم",
  termine: "منجز",
  annule: "ملغى",
};

function formatDateLabel(value) {
  const iso = String(value || "").slice(0, 10);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function memberName(invitation) {
  const membre = invitation?.membre;
  const name = `${membre?.first_name || ""} ${membre?.last_name || ""}`.trim();
  return name || membre?.email || "عضو";
}

/** 0–20, demi-points compris. Virgule arabe acceptée. */
function parseNote(raw) {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 20) return null;
  return value;
}

function formatNote(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
}

export default function AdminTestDetailScreen({ navigation, route }) {
  const testId = route?.params?.testId || null;
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const [test, setTest] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [groups, setGroups] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!testId) {
      setError("معرّف الاختبار مفقود");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [testsRes, invitesRes, collecteRes] = await Promise.all([
      getAllTestsAdmin(),
      getTestInvitationsWithMembers(testId),
      getTestCollecte(testId),
    ]);
    if (!testsRes.ok) {
      setError(testsRes.error || "تعذر تحميل الاختبار");
      setLoading(false);
      return;
    }
    const found = (testsRes.tests || []).find((row) => row.id === testId) || null;
    if (!found) {
      setError("الاختبار غير موجود");
      setTest(null);
      setLoading(false);
      return;
    }
    if (!invitesRes.ok) {
      setError(invitesRes.error || "تعذر تحميل الدعوات");
      setTest(found);
      setLoading(false);
      return;
    }
    setTest(found);
    setInvitations(invitesRes.invitations || []);
    setGroups(collecteRes.ok ? collecteRes.groups || [] : []);
    if (!collecteRes.ok) {
      setError(collecteRes.error || "تعذر تحميل مواعيد الجمع");
    }
    setLoading(false);
  }, [testId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const counts = useMemo(() => {
    const tally = { invite: 0, confirme: 0, refuse: 0, note: 0 };
    invitations.forEach((invitation) => {
      if (Object.prototype.hasOwnProperty.call(tally, invitation.statut)) {
        tally[invitation.statut] += 1;
      }
    });
    return tally;
  }, [invitations]);

  const pendingSend = useMemo(
    () =>
      invitations.filter(
        (invitation) =>
          invitation.statut === "note" && !invitation.date_notification_resultat
      ),
    [invitations]
  );

  const saveNote = async (invitation) => {
    const raw = drafts[invitation.id] ?? formatNote(invitation.note);
    const note = parseNote(raw === "—" ? "" : raw);
    if (note == null) {
      Alert.alert("تنبيه", "النقطة يجب أن تكون بين 0 و 20");
      return;
    }
    setSavingId(invitation.id);
    const result = await recordTestResult({ invitationId: invitation.id, note });
    setSavingId(null);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return;
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[invitation.id];
      return next;
    });
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

  const typeLabel = TEST_TYPE_LABELS[test?.type] || "";
  const seasonName = test?.saison?.name || "—";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
        >
          <Ionicons name={arrowBack} size={22} color={palette.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {test?.titre || "تفاصيل الاختبار"}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : error && !test ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 24 + bottomGap }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{test?.titre || "اختبار"}</Text>
            <Text style={styles.metaLine}>{typeLabel || "—"}</Text>
            {test?.type === "hifz" && test?.quran_quantity ? (
              <Text style={styles.metaLine}>{test.quran_quantity}</Text>
            ) : null}
            <Text style={styles.metaLine}>{seasonName}</Text>
            <Text style={styles.metaLine}>
              {TEST_STATUT_LABELS[test?.statut] || test?.statut || "—"}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>ملخص الدعوات</Text>
            <View style={styles.pills}>
              {Object.entries(STATUT_LABELS).map(([key, label]) => (
                <View key={key} style={styles.pill}>
                  <Text style={styles.pillText}>
                    {label} {counts[key]}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>الجمع حسب التاريخ</Text>
            {error && test ? <Text style={styles.errorText}>{error}</Text> : null}
            {groups.length === 0 ? (
              <Text style={styles.emptyText}>لا يوجد أعضاء مؤكدون بعد</Text>
            ) : (
              groups.map((group) => (
                <View key={group.dateChoisie || "sans-date"} style={styles.groupRow}>
                  <Text style={styles.groupDate}>
                    {group.dateChoisie
                      ? formatDateLabel(group.dateChoisie)
                      : "بدون تاريخ"}
                  </Text>
                  <Text style={styles.groupCount}>
                    {group.invitations.length} أعضاء
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>الأعضاء</Text>
            {invitations.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد دعوات لهذا الاختبار</Text>
            ) : (
              invitations.map((invitation) => {
                const sent = !!invitation.date_notification_resultat;
                const canEdit =
                  (invitation.statut === "confirme" || invitation.statut === "note") &&
                  !sent;
                const draft =
                  drafts[invitation.id] != null
                    ? drafts[invitation.id]
                    : invitation.note == null
                      ? ""
                      : formatNote(invitation.note);
                return (
                  <View key={invitation.id} style={styles.memberRow}>
                    <Text style={styles.memberName}>{memberName(invitation)}</Text>
                    <Text style={styles.memberMeta}>
                      {STATUT_LABELS[invitation.statut] || invitation.statut}
                      {" · "}
                      {invitation.date_choisie
                        ? formatDateLabel(invitation.date_choisie)
                        : "بدون تاريخ"}
                    </Text>
                    {sent ? (
                      <Text style={styles.sentText}>
                        {formatNote(invitation.note)}/20 · تم الإرسال
                      </Text>
                    ) : canEdit ? (
                      <View style={styles.noteRow}>
                        <TextInput
                          style={styles.noteInput}
                          value={draft}
                          onChangeText={(value) =>
                            setDrafts((prev) => ({ ...prev, [invitation.id]: value }))
                          }
                          keyboardType="decimal-pad"
                          placeholder="0–20"
                          placeholderTextColor={palette.textSecondary}
                          textAlign={textAlignStart}
                        />
                        <TouchableOpacity
                          style={[
                            styles.saveBtn,
                            savingId === invitation.id && { opacity: 0.6 },
                          ]}
                          onPress={
                            savingId === invitation.id
                              ? undefined
                              : () => saveNote(invitation)
                          }
                        >
                          <Text style={styles.saveBtnText}>
                            {savingId === invitation.id ? "..." : "حفظ"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.memberMeta}>
                        {invitation.note == null ? "—" : `${formatNote(invitation.note)}/20`}
                      </Text>
                    )}
                  </View>
                );
              })
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.sendBtn,
              (pendingSend.length === 0 || sending) && { opacity: 0.5 },
            ]}
            onPress={pendingSend.length === 0 || sending ? undefined : confirmSend}
          >
            <Text style={styles.sendBtnText}>
              {sending ? "جاري الإرسال..." : "إرسال النتائج"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
  topBarTitle: {
    flex: 1,
    fontWeight: "700",
    fontSize: 16,
    color: palette.textPrimary,
    ...rtlText,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { padding: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 6,
    ...rtlText,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 10,
    ...rtlText,
  },
  metaLine: {
    fontSize: 13,
    color: palette.textSecondary,
    marginTop: 2,
    ...rtlText,
  },
  pills: { flexDirection: row, flexWrap: "wrap", gap: 8 },
  pill: {
    backgroundColor: palette.softGreen,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12, fontWeight: "600", color: palette.primary, ...rtlText },
  groupRow: {
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  groupDate: { fontSize: 14, color: palette.textPrimary, ...rtlText },
  groupCount: { fontSize: 13, color: palette.textSecondary, ...rtlText },
  memberRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  memberName: { fontSize: 15, fontWeight: "600", color: palette.textPrimary, ...rtlText },
  memberMeta: { fontSize: 12, color: palette.textSecondary, marginTop: 2, ...rtlText },
  sentText: { marginTop: 6, fontSize: 13, fontWeight: "700", color: palette.primary, ...rtlText },
  noteRow: { flexDirection: row, alignItems: "center", gap: 8, marginTop: 8 },
  noteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: palette.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: palette.textPrimary,
    ...rtlText,
  },
  saveBtn: {
    backgroundColor: palette.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", ...rtlText },
  sendBtn: {
    backgroundColor: palette.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  sendBtnText: { color: "#fff", fontWeight: "700", fontSize: 16, ...rtlText },
  emptyText: { color: palette.textSecondary, fontSize: 13, ...rtlText },
  errorText: { color: palette.red, fontSize: 14, textAlign: "center", ...rtlText },
  retryBtn: {
    marginTop: 12,
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "700", ...rtlText },
});
