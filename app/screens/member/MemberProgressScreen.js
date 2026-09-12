import React, { useCallback, useMemo, useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useApp } from "../../context/AppContext";
import { colors, radii, shadows } from "../../constants/theme";
import {
  rtlText,
  rtlTextBold,
  fonts,
  arrowBack,
  row,
  row as rtlRow,
  textAlignStart,
  isRTL,
} from "../../constants/rtl";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import {
  addProgressEntry,
  computeProgressMetrics,
  flushMemberProgressDelta,
  getMemberDeclaredHizbCount,
  getMemberHizbCompletesBeforeDate,
  getMemberSeasonObjectif,
  getMyProgress,
  latestProgressionRow,
} from "../../lib/progressApi";
import { resolveMemberSeasonAlertCutoff } from "../../lib/alertsApi";
import {
  getMyObjectif,
  parseObjectifInput,
  setMyObjectif,
} from "../../lib/objectifsApi";
import {
  TOTAL_HIZB,
  TUMUN_UI_MAX,
  TUMUN_UI_MIN,
  formatHizbCount,
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

/** nb_hizb_completes de la dernière ligne progression, 0 si aucune. */
function departFromEntries(list) {
  const latest = latestProgressionRow(list);
  if (!latest) return 0;
  const metrics = computeProgressMetrics(latest);
  const n = Number(metrics?.nbHizbCompletes ?? latest.nb_hizb_completes ?? 0);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, TOTAL_HIZB);
}

/**
 * `saisons.start_date` déjà chargé via le contexte (startDate).
 * YYYY-MM-DD, ou YYYY/MM/DD des placeholders admin. Sinon null (illisible).
 */
function seasonStartDateIso(season) {
  const raw = String(season?.startDate || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!slash) return null;
  return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
}

export default function MemberProgressScreen({ navigation }) {
  const { seasons, currentUser } = useApp();
  const [hizb, setHizb] = useState("");
  const [tumun, setTumun] = useState("");
  const [notes, setNotes] = useState("");
  const [goalHizb, setGoalHizb] = useState("");
  const [goalSuggestedFromInscription, setGoalSuggestedFromInscription] =
    useState(false);
  const [hizbSuggestedFromInscription, setHizbSuggestedFromInscription] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingObjectif, setSavingObjectif] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loadError, setLoadError] = useState(null);
  /** Ligne objectifs déjà persistée (départ figé). Null = pas encore créée. */
  const [objectifRow, setObjectifRow] = useState(null);
  /** Position au début de saison ; null = repli sur la position du jour. */
  const [seasonStartDepart, setSeasonStartDepart] = useState(null);

  const activeSeason = getActiveRegularSeason(seasons);
  const saisonId = activeSeason?.id ?? null;
  const authId = currentUser?.authId || null;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    await flushMemberProgressDelta();
    const season = getActiveRegularSeason(seasons);
    const activeSaisonId = season?.id ?? null;
    const startIso = seasonStartDateIso(season);
    const cutoffRes =
      authId && activeSaisonId
        ? await resolveMemberSeasonAlertCutoff(authId, activeSaisonId)
        : { ok: true, sinceIso: null };
    const sinceIso = cutoffRes.sinceIso || startIso || null;
    const [res, objRes, departRes] = await Promise.all([
      getMyProgress({
        since: sinceIso || undefined,
        saisonId: activeSaisonId,
      }),
      activeSaisonId
        ? getMyObjectif(activeSaisonId)
        : Promise.resolve({ ok: true, objectif: null }),
      authId && startIso
        ? getMemberHizbCompletesBeforeDate(authId, startIso)
        : Promise.resolve(null),
    ]);
    if (departRes && departRes.ok) {
      setSeasonStartDepart(departRes.nbHizbCompletes);
    } else {
      setSeasonStartDepart(null);
    }
    setLoading(false);
    // Ligne objectifs existante prioritaire ; sinon suggestion d'inscription, sans écriture
    if (!objRes.ok) {
      setGoalHizb("");
      setGoalSuggestedFromInscription(false);
      setObjectifRow(null);
    } else if (objRes.objectif?.nbHizbCible != null) {
      setGoalHizb(String(objRes.objectif.nbHizbCible));
      setGoalSuggestedFromInscription(false);
      setObjectifRow(objRes.objectif);
    } else if (activeSaisonId && authId) {
      setObjectifRow(null);
      const declared = await getMemberSeasonObjectif(authId, activeSaisonId);
      const parsed = declared.ok
        ? parseObjectifInput(declared.objectif)
        : { ok: false };
      if (parsed.ok) {
        setGoalHizb(String(parsed.value));
        setGoalSuggestedFromInscription(true);
      } else {
        setGoalHizb("");
        setGoalSuggestedFromInscription(false);
      }
    } else {
      setGoalHizb("");
      setGoalSuggestedFromInscription(false);
      setObjectifRow(null);
    }
    if (!res.ok) {
      setLoadError(res.error);
      setHizbSuggestedFromInscription(false);
      return;
    }
    const list = res.entries || [];
    setEntries(list);
    const latest = latestProgressionRow(list);
    if (latest) {
      // Position réelle : jamais de suggestion inférieure à la progression
      const metrics = computeProgressMetrics(latest);
      setHizb(String(metrics?.nbHizbCompletes ?? latest.nb_hizb_completes ?? ""));
      const tumunVal =
        latest.tumun_courant != null && latest.tumun_courant !== ""
          ? Number(latest.tumun_courant)
          : 0;
      setTumun(String(tumunStoredToUi(Number.isFinite(tumunVal) ? tumunVal : 0)));
      setNotes("");
      setHizbSuggestedFromInscription(false);
    } else {
      // Aucune ligne progression : suggestion hizbCount, الثمن inchangé (vide)
      setTumun("");
      setNotes("");
      if (activeSaisonId && authId) {
        const declared = await getMemberDeclaredHizbCount(
          authId,
          activeSaisonId
        );
        const parsed =
          declared.ok && declared.hizbCount != null
            ? parseHizbInput(declared.hizbCount)
            : { ok: false };
        if (parsed.ok) {
          setHizb(String(parsed.value));
          setHizbSuggestedFromInscription(true);
        } else {
          setHizb("");
          setHizbSuggestedFromInscription(false);
        }
      } else {
        setHizb("");
        setHizbSuggestedFromInscription(false);
      }
    }
  }, [seasons, authId]);

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
    setHizbSuggestedFromInscription(false);
    Alert.alert("تم", "تم حفظ موضعك في القرآن", [
      { text: "حسناً", onPress: () => navigation.goBack() },
    ]);
  };

  const handleSaveObjectif = async () => {
    if (!saisonId) return;
    const parsed = parseObjectifInput(goalHizb);
    if (!parsed.ok) {
      Alert.alert("تنبيه", parsed.error);
      return;
    }
    setSavingObjectif(true);
    // Départ figé à la création uniquement ; l'API ignore aussi le 3e argument si la ligne existe.
    const isCreate = !objectifRow;
    let nbHizbDepart;
    if (isCreate) {
      const startIso = seasonStartDateIso(getActiveRegularSeason(seasons));
      if (startIso && authId) {
        const before = await getMemberHizbCompletesBeforeDate(authId, startIso);
        nbHizbDepart = before.ok
          ? before.nbHizbCompletes
          : departFromEntries(entries);
      } else {
        // date_debut absente / illisible : même repli que l'ancien comportement
        nbHizbDepart = departFromEntries(entries);
      }
    }
    const result = await setMyObjectif(saisonId, parsed.value, nbHizbDepart);
    setSavingObjectif(false);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error || "تعذر حفظ الهدف");
      return;
    }
    setGoalSuggestedFromInscription(false);
    setObjectifRow(result.objectif || objectifRow);
    Alert.alert("تم", "تم حفظ هدف الموسم");
  };

  const objectifMeaning = useMemo(() => {
    const parsed = parseObjectifInput(goalHizb);
    if (!parsed.ok) return null;
    const depart = objectifRow
      ? Number(objectifRow.nbHizbDepart) || 0
      : seasonStartDepart != null
        ? seasonStartDepart
        : departFromEntries(entries);
    const cibleFinale = depart + parsed.value;
    return `موضعك في بداية الموسم ${formatHizbCount(depart)} + الهدف ${formatHizbCount(parsed.value)} = ${formatHizbCount(cibleFinale)} في نهاية الموسم`;
  }, [goalHizb, objectifRow, entries, seasonStartDepart]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar style="dark" />

      <View style={styles.headerWrap}>
        <LinearGradient colors={colors.gradientHeader} style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.goBack()}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="رجوع"
            >
              <Ionicons name={arrowBack} size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>تسجيل التقدم</Text>
              <Text style={styles.headerSubtitle}>
                موضعك في الحفظ لهذا الموسم
              </Text>
            </View>
            <Ionicons name="trending-up" size={22} color="#fff" />
          </View>
        </LinearGradient>
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
          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : loadError ? (
            <Text style={styles.errorText}>{loadError}</Text>
          ) : (
            <View style={[styles.card, shadows.card]}>
              <Text style={styles.lead}>
                هذا مقدار حفظك الكامل في القرآن الكريم، مستقل عن برامج الحفظ
                والمراجعة. يمكنك تصحيحه في أي وقت.
              </Text>
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
              {hizbSuggestedFromInscription ? (
                <Text style={styles.hizbSuggestHint}>
                  قيمة مقترحة من أحزابك المحفوظة عند التسجيل — لم تُحفظ بعد
                </Text>
              ) : null}

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

          {!loading && saisonId ? (
            <View style={[styles.card, shadows.card]}>
              <Text style={styles.historyTitle}>هدف الموسم</Text>
              <Text style={styles.objectifHint}>
                عدد الأحزاب الإضافية التي تطمح لحفظها خلال هذا الموسم (1 إلى 60).
              </Text>
              {goalSuggestedFromInscription ? (
                <Text style={styles.objectifSuggestHint}>
                  قيمة مقترحة من استمارتك عند التسجيل — لم تُحفظ بعد كهدف
                  للموسم.
                </Text>
              ) : null}
              <TextInput
                style={styles.input}
                value={goalHizb}
                onChangeText={setGoalHizb}
                keyboardType="number-pad"
                placeholder="مثال : 2"
                placeholderTextColor={colors.placeholder}
                textAlign={textAlignStart}
              />
              {objectifMeaning ? (
                <Text style={styles.objectifMeaning}>{objectifMeaning}</Text>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  savingObjectif && styles.saveBtnDisabled,
                ]}
                onPress={savingObjectif ? undefined : handleSaveObjectif}
                activeOpacity={0.85}
              >
                {savingObjectif ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveBtnText}>حفظ الهدف</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

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
                        {formatHizbCount(metrics?.nbHizbCompletes ?? 0)}
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

const alignEdge = isRTL ? "flex-start" : "flex-end";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  header: {
    borderRadius: radii.lg,
    overflow: "hidden",
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    alignItems: alignEdge,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    marginTop: 4,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  lead: {
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.regular,
    lineHeight: 22,
    marginBottom: 12,
    ...rtlText,
  },
  loader: { marginVertical: 24 },
  errorText: {
    color: colors.red,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  fieldsRow: {
    flexDirection: rtlRow,
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  fieldCol: { flex: 1, minWidth: 0 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: 8,
    ...rtlText,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  notesInput: {
    minHeight: 88,
    textAlignVertical: "top",
    fontFamily: fonts.regular,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    color: "white",
    fontFamily: fonts.bold,
    fontSize: 16,
    ...rtlText,
  },
  historyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
    ...rtlTextBold,
  },
  objectifHint: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.regular,
    marginBottom: 12,
    lineHeight: 20,
    ...rtlText,
  },
  objectifMeaning: {
    fontSize: 13,
    color: colors.text,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 12,
    lineHeight: 20,
    ...rtlText,
  },
  objectifSuggestHint: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 12,
    lineHeight: 18,
    ...rtlText,
  },
  hizbSuggestHint: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 12,
    lineHeight: 18,
    ...rtlText,
  },
  historyRow: { paddingVertical: 8 },
  historyRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyMain: {
    flexDirection: rtlRow,
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  historyMeta: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  historyBody: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  historyNote: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
    ...rtlText,
  },
});
