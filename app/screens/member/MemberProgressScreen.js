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
import { getActiveRegularSeason, getActiveSeason } from "../../lib/seasonScope";
import { getMyActiveEnrollment } from "../../lib/membersApi";
import {
  addProgressEntry,
  computeProgressMetrics,
  flushMemberProgressDelta,
  getMemberDeclaredHizbCount,
  getMemberSeasonObjectif,
  getMyProgress,
  getMyCurrentProgressPosition,
  getMySeasonProgress,
  PROGRESS_LOCKED_MESSAGE,
} from "../../lib/progressApi";
import { resolveMemberSeasonAlertCutoff } from "../../lib/alertsApi";
import { useSubmitLock } from "../../lib/useSubmitLock";
import {
  getMyObjectif,
  parseObjectifInput,
  setMyObjectif,
  OBJECTIF_LOCKED_MESSAGE,
  OBJECTIF_POSITION_REQUIRED_MESSAGE,
} from "../../lib/objectifsApi";
import {
  TOTAL_HIZB,
  TUMUNS_PER_HIZB,
  TUMUN_COURANT_LABEL,
  clampMemberTumuns,
  formatHizbCount,
  formatMemberPosition,
  memberTumunsFromPosition,
  parseTumunCourantInput,
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

/** 60 حزب : الثمن est bloqué à 0. */
function isKhatmInput(raw) {
  return Number(String(raw ?? "").trim()) === TOTAL_HIZB;
}

/** Titre de carte + trait jaune 32 × 3 (même trait que les titres des statistiques). */
function CardTitle({ title }) {
  return (
    <View style={styles.cardTitleWrap}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardTitleLine} />
    </View>
  );
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
  // Verrous synchrones contre le double appui (connexion lente).
  const { busy: saving, run: runSavePosition } = useSubmitLock();
  const { busy: savingObjectif, run: runSaveObjectif } = useSubmitLock();
  const [entries, setEntries] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [progressLocked, setProgressLocked] = useState(false);
  /** Départ / gain calculés par le serveur (get_member_season_progress). */
  const [seasonProgress, setSeasonProgress] = useState(null);
  /** Dernière position enregistrée (résumé de la carte 1). Null = aucune. */
  const [savedMetrics, setSavedMetrics] = useState(null);

  const activeSeason = getActiveRegularSeason(seasons);
  const saisonId = activeSeason?.id ?? null;
  const authId = currentUser?.authId || null;

  const reloadSeasonProgress = useCallback(async () => {
    const res = await getMySeasonProgress();
    setSeasonProgress(res.ok ? res.progress : null);
  }, []);

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
    const [res, posRes, objRes, progressRes, enrollRes] = await Promise.all([
      getMyProgress({
        since: sinceIso || undefined,
        saisonId: activeSaisonId,
      }),
      getMyCurrentProgressPosition(),
      activeSaisonId
        ? getMyObjectif(activeSaisonId)
        : Promise.resolve({ ok: true, objectif: null }),
      getMySeasonProgress(),
      getMyActiveEnrollment(),
    ]);
    setSeasonProgress(progressRes.ok ? progressRes.progress : null);
    if (enrollRes.ok) setProgressLocked(!enrollRes.enrolled);
    setLoading(false);
    // Ligne objectifs existante prioritaire ; sinon suggestion d'inscription, sans écriture
    if (!objRes.ok) {
      setGoalHizb("");
      setGoalSuggestedFromInscription(false);
    } else if (objRes.objectif?.nbHizbCible != null) {
      setGoalHizb(String(objRes.objectif.nbHizbCible));
      setGoalSuggestedFromInscription(false);
    } else if (activeSaisonId && authId) {
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
    }
    if (!res.ok) {
      setEntries([]);
      setHistoryError(res.error);
    } else {
      setEntries(res.entries || []);
      setHistoryError(null);
    }
    if (!posRes.ok) {
      setLoadError(posRes.error);
      setHizbSuggestedFromInscription(false);
      setSavedMetrics(null);
      return;
    }
    setLoadError(null);
    const latest = posRes.hasData ? posRes.entry : null;
    setSavedMetrics(latest ? computeProgressMetrics(latest) : null);
    if (latest) {
      // Position réelle : jamais de suggestion inférieure à la progression
      const metrics = computeProgressMetrics(latest);
      setHizb(String(metrics?.nbHizbCompletes ?? latest.nb_hizb_completes ?? ""));
      // Valeur stockée = valeur affichée (0–7), sans conversion.
      const tumunVal =
        latest.tumun_courant != null && latest.tumun_courant !== ""
          ? Number(latest.tumun_courant)
          : 0;
      setTumun(String(Number.isFinite(tumunVal) ? tumunVal : 0));
      setNotes("");
      setHizbSuggestedFromInscription(false);
    } else {
      // Aucune ligne progression : suggestion حزب = hizbCount, ثمن = 0
      setTumun("0");
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

  const handleSave = () => runSavePosition(savePosition);

  const savePosition = async () => {
    if (progressLocked) {
      Alert.alert("تنبيه", PROGRESS_LOCKED_MESSAGE);
      return;
    }
    const hizbRes = parseHizbInput(hizb);
    if (!hizbRes.ok) {
      Alert.alert("تنبيه", hizbRes.error);
      return;
    }
    // 60 حزب : ثمن bloqué à 0, quelle que soit la valeur du champ.
    const tumunRes =
      hizbRes.value === TOTAL_HIZB
        ? { ok: true, value: 0 }
        : parseTumunCourantInput(tumun);
    if (!tumunRes.ok) {
      Alert.alert("تنبيه", tumunRes.error);
      return;
    }

    const result = await addProgressEntry({
      nbHizbCompletes: hizbRes.value,
      tumunCourant: tumunRes.value,
      saisonId: getActiveSeason(seasons)?.id ?? null,
      notes: String(notes || "").trim() || null,
    });
    if (!result.ok) {
      Alert.alert("تنبيه", result.error || "تعذر حفظ التقدم");
      return;
    }
    await reloadSeasonProgress();
    setHizbSuggestedFromInscription(false);
    Alert.alert("تم", "تم حفظ موضعك في القرآن", [
      { text: "حسناً", onPress: () => navigation.goBack() },
    ]);
  };

  /**
   * Départ de saison inconnu (aucune position enregistrée ; la suggestion
   * d'inscription ne compte pas) : le serveur refuse l'objectif (0137).
   */
  const needsPosition = seasonProgress?.depart == null;
  const objectifDisabled = savingObjectif || progressLocked || needsPosition;

  const handleSaveObjectif = () => runSaveObjectif(saveObjectif);

  const saveObjectif = async () => {
    if (progressLocked) {
      Alert.alert("تنبيه", OBJECTIF_LOCKED_MESSAGE);
      return;
    }
    if (needsPosition) {
      Alert.alert("تنبيه", OBJECTIF_POSITION_REQUIRED_MESSAGE);
      return;
    }
    if (!saisonId) return;
    const parsed = parseObjectifInput(goalHizb);
    if (!parsed.ok) {
      Alert.alert("تنبيه", parsed.error);
      return;
    }
    // Le départ n'est plus envoyé : le serveur le calcule (0135).
    const result = await setMyObjectif(saisonId, parsed.value);
    if (!result.ok) {
      // Refus serveur (ex. 0137 sur un état local périmé) : message tel quel.
      Alert.alert("تنبيه", result.error || "تعذر حفظ الهدف");
      return;
    }
    await reloadSeasonProgress();
    setGoalSuggestedFromInscription(false);
    Alert.alert("تم", "تم حفظ هدف الموسم");
  };

  /**
   * « بداية الموسم D + الهدف C = نهاية الموسم F ». D vient de la RPC (أثمان),
   * C = valeur saisie (suit la frappe), F = least(480, D + C × 8).
   * C invalide → « — » pour C et F.
   */
  const objectifEquation = useMemo(() => {
    const depart = seasonProgress?.depart;
    if (depart == null) return null;
    const parsed = parseObjectifInput(goalHizb);
    const fin = parsed.ok
      ? clampMemberTumuns(depart + parsed.value * TUMUNS_PER_HIZB)
      : null;
    const cible = parsed.ok ? formatHizbCount(parsed.value) : "—";
    const finLabel = fin != null ? formatMemberPosition(fin) : "—";
    return `بداية الموسم ${formatMemberPosition(depart)} + الهدف ${cible} = نهاية الموسم ${finLabel}`;
  }, [goalHizb, seasonProgress]);

  const tumunLocked = isKhatmInput(hizb);

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
              <CardTitle title="مقدار حفظي" />
              {savedMetrics ? (
                <View style={styles.summary}>
                  <Text style={styles.summaryValue}>
                    {formatMemberPosition(savedMetrics.tumunTotal)}
                  </Text>
                  <Text style={styles.summaryPct}>
                    {`${savedMetrics.globalPct}٪ من القرآن (يمكنك تصحيحه في أي وقت)`}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>عدد الأحزاب المكتملة (0–60)</Text>
              <TextInput
                style={styles.input}
                value={hizb}
                onChangeText={setHizb}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.placeholder}
                textAlign={textAlignStart}
              />
              <Text style={styles.fieldLabel}>{TUMUN_COURANT_LABEL}</Text>
              <TextInput
                style={styles.input}
                value={tumunLocked ? "0" : tumun}
                onChangeText={setTumun}
                editable={!tumunLocked}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.placeholder}
                textAlign={textAlignStart}
              />
              {/* Vrai seulement sans ligne progression (load) ; remis à false après « حفظ الموضع ». */}
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
                textAlign={textAlignStart}
                numberOfLines={2}
                multiline
              />

              {progressLocked ? (
                <Text style={styles.hizbSuggestHint}>{PROGRESS_LOCKED_MESSAGE}</Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  (saving || progressLocked) && styles.saveBtnDisabled,
                ]}
                onPress={saving || progressLocked ? undefined : handleSave}
                activeOpacity={0.85}
                disabled={saving || progressLocked}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveBtnText}>حفظ الموضع</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {!loading && saisonId && needsPosition ? (
            // Départ inconnu : carte grisée, une seule ligne (0137 refuserait l'objectif).
            <View style={[styles.card, shadows.card, styles.cardMuted]}>
              <CardTitle title="هدفي لهذا الموسم" />
              <Text style={styles.lead}>احفظ موضعك أولاً</Text>
            </View>
          ) : null}

          {!loading && saisonId && !needsPosition ? (
            <View style={[styles.card, shadows.card]}>
              <CardTitle title="هدفي لهذا الموسم" />
              {progressLocked ? (
                <Text style={styles.objectifSuggestHint}>
                  {OBJECTIF_LOCKED_MESSAGE}
                </Text>
              ) : null}
              <View style={styles.goalLabelRow}>
                <Text style={styles.fieldLabelInline}>
                  عدد الأحزاب الإضافية (1–60)
                </Text>
                {goalSuggestedFromInscription ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>مقترح</Text>
                  </View>
                ) : null}
              </View>
              <TextInput
                style={styles.input}
                value={goalHizb}
                onChangeText={setGoalHizb}
                keyboardType="number-pad"
                placeholder="مثال : 2"
                placeholderTextColor={colors.placeholder}
                textAlign={textAlignStart}
                editable={!progressLocked}
              />
              {objectifEquation ? (
                <Text
                  style={styles.objectifEquation}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {objectifEquation}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.saveBtn, objectifDisabled && styles.saveBtnDisabled]}
                onPress={objectifDisabled ? undefined : handleSaveObjectif}
                activeOpacity={0.85}
                disabled={objectifDisabled}
              >
                {savingObjectif ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveBtnText}>حفظ الهدف</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {!loading && historyError ? (
            <Text style={styles.errorText}>{historyError}</Text>
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
                        {formatMemberPosition(
                          memberTumunsFromPosition(
                            metrics?.nbHizbCompletes,
                            entry.tumun_courant
                          )
                        )}
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
    paddingVertical: 12,
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
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  cardTitleWrap: {
    alignItems: alignEdge,
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    ...rtlTextBold,
  },
  cardTitleLine: {
    width: 32,
    height: 3,
    marginTop: 4,
    borderRadius: 2,
    backgroundColor: colors.highlight,
  },
  cardMuted: { opacity: 0.6 },
  summary: {
    alignItems: alignEdge,
    marginBottom: 10,
  },
  summaryValue: {
    fontSize: 22,
    color: colors.primary,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  summaryPct: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.regular,
    marginTop: 2,
    ...rtlText,
  },
  lead: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.regular,
    lineHeight: 20,
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
  fieldLabel: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: 8,
    ...rtlText,
  },
  goalLabelRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  fieldLabelInline: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
    ...rtlText,
  },
  badge: {
    backgroundColor: colors.goldSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  objectifEquation: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    marginTop: -4,
    marginBottom: 12,
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
    minHeight: 56,
    textAlignVertical: "top",
    fontFamily: fonts.regular,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 9,
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
