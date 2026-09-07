import React, { useCallback, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useApp } from "../../context/AppContext";
import { colors, radii, shadows } from "../../constants/theme";
import {
  rtlText,
  rtlTextBold,
  fonts,
  arrowBack,
  row as rtlRow,
  textAlignStart,
} from "../../constants/rtl";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import {
  addProgressEntry,
  computeProgressMetrics,
  flushMemberProgressDelta,
  getMyProgress,
  latestProgressionRow,
} from "../../lib/progressApi";
import {
  TOTAL_HIZB,
  TUMUN_UI_MAX,
  TUMUN_UI_MIN,
  tumunStoredToUi,
  tumunUiToStored,
} from "../../lib/tumun";

function parseHizbInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return { ok: false, error: "أدخل عدد الأحزاب المكتملة (0 إلى 60)" };
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > TOTAL_HIZB) {
    return { ok: false, error: "عدد الأحزاب المكتملة يجب أن يكون بين 0 و 60" };
  }
  return { ok: true, value: n };
}

function parseTumunInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return { ok: true, value: TUMUN_UI_MAX };
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < TUMUN_UI_MIN || n > TUMUN_UI_MAX) {
    return { ok: false, error: "الثمن الحالي يجب أن يكون بين 1 و 8" };
  }
  return { ok: true, value: n };
}

export default function MemberProgressScreen({ navigation }) {
  const { seasons } = useApp();
  const [hizb, setHizb] = useState("");
  const [tumun, setTumun] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    await flushMemberProgressDelta();
    const res = await getMyProgress();
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    const list = res.entries || [];
    setEntries(list);
    const latest = latestProgressionRow(list);
    if (latest) {
      const metrics = computeProgressMetrics(latest);
      setHizb(String(metrics?.nbHizbCompletes ?? latest.nb_hizb_completes ?? ""));
      const tumunVal =
        latest.tumun_courant != null && latest.tumun_courant !== ""
          ? Number(latest.tumun_courant)
          : 0;
      setTumun(String(tumunStoredToUi(Number.isFinite(tumunVal) ? tumunVal : 0)));
      setNotes("");
    } else {
      setHizb("");
      setTumun("");
      setNotes("");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleSave = async () => {
    const hizbRes = parseHizbInput(hizb);
    if (!hizbRes.ok) {
      Alert.alert("تنبيه", hizbRes.error);
      return;
    }
    const tumunRes = parseTumunInput(tumun);
    if (!tumunRes.ok) {
      Alert.alert("تنبيه", tumunRes.error);
      return;
    }
    if (hizbRes.value === TOTAL_HIZB && tumunRes.value !== TUMUN_UI_MAX) {
      Alert.alert("تنبيه", "عند إكمال 60 حزباً يكون الثمن 8");
      return;
    }

    setSaving(true);
    const result = await addProgressEntry({
      nbHizbCompletes: hizbRes.value,
      tumunCourant: tumunUiToStored(tumunRes.value),
      saisonId: getActiveRegularSeason(seasons)?.id ?? null,
      notes: String(notes || "").trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error || "تعذر حفظ التقدم");
      return;
    }
    Alert.alert("تم", "تم حفظ موضعك في القرآن", [
      { text: "حسناً", onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="رجوع"
        >
          <Ionicons name={arrowBack} size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تسجيل التقدم</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lead}>
            هذا موضعك في القرآن، مستقل عن برامج الحفظ والمراجعة. يمكنك تصحيحه في
            أي وقت.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : loadError ? (
            <Text style={styles.errorText}>{loadError}</Text>
          ) : (
            <View style={[styles.card, shadows.card]}>
              <View style={styles.fieldsRow}>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>الأحزاب المكتملة (0–60)</Text>
                  <TextInput
                    style={styles.input}
                    value={hizb}
                    onChangeText={setHizb}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.placeholder}
                    textAlign={textAlignStart}
                  />
                </View>
                <View style={styles.fieldCol}>
                  <Text style={styles.fieldLabel}>الثمن الحالي (1–8)</Text>
                  <TextInput
                    style={styles.input}
                    value={tumun}
                    onChangeText={setTumun}
                    keyboardType="number-pad"
                    placeholder="8"
                    placeholderTextColor={colors.placeholder}
                    textAlign={textAlignStart}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>ملاحظة (اختياري)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="مثال: وصلت إلى سورة الكهف"
                placeholderTextColor={colors.placeholder}
                textAlign={textAlignStart}
                multiline
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={saving ? undefined : handleSave}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveBtnText}>حفظ الموضع</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {!loading && entries.length > 0 ? (
            <View style={[styles.card, shadows.card]}>
              <Text style={styles.historyTitle}>آخر التسجيلات</Text>
              {entries.slice(0, 5).map((entry, idx) => {
                const metrics = computeProgressMetrics(entry);
                const when = String(
                  metrics?.dateSaisie || entry.date_saisie || entry.date || ""
                ).slice(0, 10);
                return (
                  <View
                    key={entry.id || idx}
                    style={[styles.historyRow, idx > 0 && styles.historyRowBorder]}
                  >
                    <View style={styles.historyMain}>
                      <Text style={styles.historyBody}>
                        {metrics?.nbHizbCompletes ?? 0} حزب
                        {` · الثمن ${tumunStoredToUi(entry.tumun_courant)}`}
                        {metrics?.globalPct != null
                          ? ` · ${metrics.globalPct}%`
                          : ""}
                      </Text>
                      <Text style={styles.historyMeta}>{when || "—"}</Text>
                    </View>
                    {metrics?.notes ? (
                      <Text style={styles.historyNote}>{metrics.notes}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: radii.sm,
    paddingHorizontal: radii.lg,
    paddingVertical: radii.md,
    backgroundColor: colors.primary,
  },
  headerBtn: {
    padding: 4,
    minWidth: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "white",
    fontSize: radii.lg,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  content: { padding: radii.lg, paddingBottom: radii.xl, gap: radii.md },
  lead: {
    fontSize: radii.md,
    color: colors.muted,
    fontFamily: fonts.regular,
    lineHeight: radii.lg + radii.sm,
    ...rtlText,
  },
  loader: { marginVertical: radii.lg },
  errorText: {
    color: colors.red,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    padding: radii.lg,
  },
  fieldsRow: {
    flexDirection: rtlRow,
    alignItems: "flex-start",
    gap: radii.md,
    marginBottom: radii.sm,
  },
  fieldCol: { flex: 1, minWidth: 0 },
  fieldLabel: {
    fontSize: radii.md,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: radii.sm,
    ...rtlText,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: radii.md,
    paddingVertical: radii.sm,
    marginBottom: radii.md,
    fontSize: radii.lg,
    color: colors.text,
    backgroundColor: colors.bg,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  notesInput: {
    minHeight: radii.xl * 3 + radii.md,
    textAlignVertical: "top",
    fontFamily: fonts.regular,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: radii.md,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    color: "white",
    fontFamily: fonts.bold,
    fontSize: radii.lg,
    ...rtlText,
  },
  historyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: radii.lg,
    color: colors.text,
    marginBottom: radii.sm,
    ...rtlTextBold,
  },
  historyRow: { paddingVertical: radii.sm },
  historyRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyMain: {
    flexDirection: rtlRow,
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: radii.sm,
  },
  historyMeta: {
    fontSize: radii.md,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  historyBody: {
    flex: 1,
    fontSize: radii.md,
    color: colors.text,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  historyNote: {
    fontSize: radii.md,
    color: colors.muted,
    marginTop: 2,
    ...rtlText,
  },
});
