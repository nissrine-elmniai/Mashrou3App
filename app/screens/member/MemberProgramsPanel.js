import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useApp, newMemberProgramId } from "../../context/AppContext";
import { useSubmitLock } from "../../lib/useSubmitLock";
import { colors, radii } from "../../constants/theme";
import { rtlText, row, textAlignStart } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import {
  PROGRAM_TYPE_HIFZ,
  PROGRAM_TYPE_MOURAJA3A,
  isHifzProgram,
  normalizeProgramType,
} from "../../lib/memberProgramsApi";
import {
  flushMemberProgressDelta,
  PROGRESS_LOCKED_MESSAGE,
} from "../../lib/progressApi";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import { getMyActiveEnrollment } from "../../lib/membersApi";
import {
  formatHizbCount,
  formatTumunAmount,
  formatUnsavedTumunDelta,
} from "../../lib/tumun";
import { useProgramTumunDraft } from "../../lib/useProgramTumunDraft";

const EMPTY_FORM = {
  title: "",
  nbHizb: "",
  durationDays: "",
  startDate: "",
  type: PROGRAM_TYPE_HIFZ,
};

function todayStr() {
  return dateToStorage(new Date());
}

function dateToStorage(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function storageToDate(str) {
  const raw = String(str || "").trim().replace(/\//g, "-");
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatDateDisplay(str) {
  const date = storageToDate(str);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function programStatus(program) {
  if (Number(program.progression) >= 100) {
    return "البرنامج منتهي";
  }
  const raw = String(program.startDate || "").replace(/\//g, "-");
  const start = new Date(raw);
  if (!Number.isNaN(start.getTime()) && program.durationDays) {
    const elapsed = Math.floor((Date.now() - start.getTime()) / 86400000);
    if (elapsed > Number(program.durationDays)) {
      return "البرنامج منتهي";
    }
  }
  return "قيد التقدم";
}

export default function MemberProgramsPanel({ navigation }) {
  const { getMemberPrograms, saveMemberProgram, seasons, retryMemberProgramsSync } =
    useApp();

  const programs = getMemberPrograms();
  const [modalVisible, setModalVisible] = useState(false);
  const [progressModal, setProgressModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const activeSeasonId = getActiveRegularSeason(seasons)?.id ?? null;
  const [progressLocked, setProgressLocked] = useState(false);
  /** Id du programme en création : fixé à l'ouverture du modal, réutilisé à chaque envoi. */
  const createIdRef = useRef(null);
  const { busy: saving, run: runSave } = useSubmitLock();

  // Ouverture de l'onglet : relance la synchro des programmes si elle a échoué.
  useEffect(() => {
    retryMemberProgramsSync();
  }, [retryMemberProgramsSync]);

  useEffect(() => {
    let cancelled = false;
    getMyActiveEnrollment().then((res) => {
      if (!cancelled && res.ok) setProgressLocked(!res.enrolled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      flushMemberProgressDelta();
    },
    []
  );

  const openCreate = () => {
    createIdRef.current = newMemberProgramId();
    setEditingId(null);
    setForm({ ...EMPTY_FORM, startDate: todayStr() });
    setModalVisible(true);
  };

  const openEdit = (program) => {
    createIdRef.current = null;
    setEditingId(program.id);
    setForm({
      title: program.title || "",
      nbHizb: String(program.nbHizb ?? ""),
      durationDays: String(program.durationDays ?? ""),
      startDate: program.startDate || todayStr(),
      type: normalizeProgramType(program.type),
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () =>
    runSave(async () => {
      const existing = editingId
        ? programs.find((program) => program.id === editingId)
        : null;
      // Création : même id pour tous les envois de ce formulaire (upsert).
      const id = editingId || createIdRef.current || undefined;
      const result = await saveMemberProgram({
        id,
        title: form.title,
        nbHizb: form.nbHizb,
        durationDays: form.durationDays,
        startDate: form.startDate,
        completedTumuns: existing?.completedTumuns ?? 0,
        type: normalizeProgramType(form.type),
      });
      if (!result.ok) {
        Alert.alert("تنبيه", result.error);
        return;
      }
      closeModal();
    });

  const quickUpdateProgress = (program) => {
    setProgressModal(program);
  };

  const openDetails = (program) => {
    navigation.navigate("ProgrammeDetails", {
      programme: {
        id: program.id,
        nom: program.title,
        nbHizb: program.nbHizb,
        duree: program.durationDays,
        completedTumuns: program.completedTumuns,
        totalTumuns: program.totalTumuns,
        progression: program.progression,
        type: program.type,
        dateDebut: program.startDate,
        statut: programStatus(program) === "البرنامج منتهي" ? "terminé" : "en cours",
      },
    });
  };

  const progressProgram = progressModal
    ? programs.find((p) => p.id === progressModal.id) || progressModal
    : null;
  const hifzWriteLocked =
    progressLocked && isHifzProgram(progressProgram);

  // ± ثمن : écart local, enregistré seulement sur « حفظ » (une écriture).
  const draft = useProgramTumunDraft(progressProgram, { locked: progressLocked });
  const unsavedLabel = formatUnsavedTumunDelta(draft.pendingDelta);

  // Fermeture directe (après حفظ réussi ou إلغاء confirmé : plus d'écart).
  const dismissProgressModal = () => {
    flushMemberProgressDelta();
    setProgressModal(null);
  };

  // X, fond, retour Android : alerte si un écart est en attente.
  const closeProgressModal = () => {
    if (draft.saving) return;
    if (!draft.guardLeave(dismissProgressModal)) dismissProgressModal();
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.newBtn, !activeSeasonId && styles.newBtnDisabled]}
        onPress={activeSeasonId ? openCreate : undefined}
        disabled={!activeSeasonId}
        activeOpacity={0.85}
      >
        <Ionicons
          name="add"
          size={20}
          color={activeSeasonId ? colors.primary : colors.muted}
        />
        <Text
          style={[
            styles.newBtnText,
            !activeSeasonId && styles.newBtnTextDisabled,
          ]}
        >
          {activeSeasonId ? "برنامج جديد" : "لا يوجد موسم نشط حالياً"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>برامج الحفظ</Text>

      {programs.length === 0 ? (
        <EmptyState
          text={
            activeSeasonId
              ? "لا يوجد برنامج بعد — اضغط «برنامج جديد»"
              : "لا يوجد موسم نشط حالياً"
          }
        />
      ) : (
        programs.map((program) => (
          <MemberProgramCard
            key={program.id}
            program={program}
            onEdit={() => openEdit(program)}
            onPress={() => openDetails(program)}
            onProgressPress={() => quickUpdateProgress(program)}
          />
        ))
      )}

      <ProgramFormModal
        visible={modalVisible}
        editing={!!editingId}
        form={form}
        onChange={setForm}
        onClose={closeModal}
        onSave={handleSave}
        saving={saving}
      />

      <Modal
        visible={!!progressProgram}
        transparent
        animationType="fade"
        onRequestClose={closeProgressModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeProgressModal}
          />
          <View style={styles.progressModalCard}>
            <View style={styles.progressModalHeader}>
              <Text style={styles.progressModalTitle}>تحديث التقدم</Text>
              <TouchableOpacity
                onPress={closeProgressModal}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="إغلاق"
              >
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.progressModalHint}>
              {progressProgram?.title}
            </Text>

            {progressProgram ? (
              <>
                <Text style={styles.tumunModalCount}>
                  {formatTumunAmount(draft.predicted)} من{" "}
                  {formatTumunAmount(progressProgram.totalTumuns)}
                </Text>
                <Text style={styles.tumunModalPct}>{draft.predictedPct}%</Text>
                {hifzWriteLocked ? (
                  <Text style={styles.progressModalHint}>
                    {PROGRESS_LOCKED_MESSAGE}
                  </Text>
                ) : null}

                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      !draft.canDecrement && styles.stepperBtnDisabled,
                    ]}
                    onPress={draft.decrement}
                    disabled={!draft.canDecrement}
                  >
                    <Text style={styles.stepperBtnText}>−</Text>
                  </TouchableOpacity>

                  <Text style={styles.stepperValue}>
                    {formatTumunAmount(draft.predicted)}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      !draft.canIncrement && styles.stepperBtnDisabled,
                    ]}
                    onPress={draft.increment}
                    disabled={!draft.canIncrement}
                  >
                    <Text style={styles.stepperBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                {unsavedLabel ? (
                  <>
                    <Text style={styles.unsavedText}>{unsavedLabel}</Text>
                    <View style={styles.draftActions}>
                      <TouchableOpacity
                        style={[
                          styles.draftCancelBtn,
                          draft.saving && styles.stepperBtnDisabled,
                        ]}
                        onPress={() => draft.confirmDiscard(dismissProgressModal)}
                        disabled={draft.saving}
                      >
                        <Text style={styles.cancelBtnText}>إلغاء</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.draftSaveBtn,
                          draft.saving && styles.createBtnDisabled,
                        ]}
                        onPress={() => draft.confirmSave(dismissProgressModal)}
                        disabled={draft.saving}
                      >
                        {draft.saving ? (
                          <ActivityIndicator color="white" />
                        ) : (
                          <Text style={styles.saveBtnText}>حفظ</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MemberProgramCard({
  program,
  onEdit,
  onPress,
  onProgressPress,
}) {
  const pct = Math.min(100, Math.max(0, Number(program.progression) || 0));
  const typeLabel = isHifzProgram(program) ? "حفظ" : "مراجعة";

  return (
    <View style={styles.card}>
      <View style={styles.cardTitleRow}>
        <Ionicons name="book-outline" size={18} color={colors.primary} />
        <Text style={styles.cardTitle} numberOfLines={1}>
          {program.title}
        </Text>
        <TouchableOpacity style={styles.iconBtn} onPress={onEdit} hitSlop={8}>
          <Ionicons name="create-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        {/* Indicateur seulement (même chevron que ProfileNotificationsCard) : pas un bouton. */}
        <Ionicons
          name="chevron-back"
          size={18}
          color={colors.muted}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>

      <TouchableOpacity style={styles.cardBody} onPress={onPress} activeOpacity={0.9}>
        <Text style={styles.metaText}>
          <Text style={styles.metaType}>{typeLabel}</Text>
          {" · "}
          {formatHizbCount(program.nbHizb)} · {program.durationDays} يوم
        </Text>

        <TouchableOpacity onPress={onProgressPress} activeOpacity={0.85}>
          <Text style={styles.pct}>{pct}%</Text>
          <View style={[styles.progressTrack, styles.progressTrackRtl]}>
            <View
              style={[
                styles.progressFill,
                styles.progressFillRtl,
                { width: `${pct}%` },
              ]}
            />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

function ProgramFormModal({
  visible,
  editing,
  form,
  onChange,
  onClose,
  onSave,
  saving = false,
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const setField = (key, value) => onChange((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!visible) setShowDatePicker(false);
  }, [visible]);

  const pickerDate = storageToDate(form.startDate || todayStr());

  const onDateChange = (event, selected) => {
    if (Platform.OS !== "ios") setShowDatePicker(false);
    if (event.type === "dismissed") return;
    if (selected) setField("startDate", dateToStorage(selected));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.dialogOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.dialogCard}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={12}
            accessibilityLabel="إغلاق"
          >
            <Ionicons name="close" size={22} color={colors.muted} />
          </TouchableOpacity>

          <Text style={styles.dialogTitle}>
            {editing ? "تعديل البرنامج" : "إنشاء برنامج جديد"}
          </Text>
          <Text style={styles.dialogSubtitle}>
            حدد برنامج الحفظ المخصص الخاص بك
          </Text>

          <Text style={styles.fieldLabel}>اسم البرنامج</Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: برنامج جزء عم"
            placeholderTextColor={colors.muted}
            value={form.title}
            onChangeText={(v) => setField("title", v)}
            textAlign={textAlignStart}
          />

          <Text style={styles.fieldLabel}>نوع البرنامج</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[
                styles.typeChip,
                form.type !== PROGRAM_TYPE_MOURAJA3A && styles.typeChipActive,
              ]}
              onPress={() => setField("type", PROGRAM_TYPE_HIFZ)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.typeChipText,
                  form.type !== PROGRAM_TYPE_MOURAJA3A &&
                    styles.typeChipTextActive,
                ]}
              >
                حفظ
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeChip,
                form.type === PROGRAM_TYPE_MOURAJA3A && styles.typeChipActive,
              ]}
              onPress={() => setField("type", PROGRAM_TYPE_MOURAJA3A)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.typeChipText,
                  form.type === PROGRAM_TYPE_MOURAJA3A &&
                    styles.typeChipTextActive,
                ]}
              >
                مراجعة
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rowFields}>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>عدد الأحزاب</Text>
              <TextInput
                style={styles.input}
                placeholder="مثال: 5"
                placeholderTextColor={colors.muted}
                value={form.nbHizb}
                onChangeText={(v) => setField("nbHizb", v)}
                keyboardType="number-pad"
                textAlign={textAlignStart}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>المدة (أيام)</Text>
              <TextInput
                style={styles.input}
                placeholder="مثال: 30"
                placeholderTextColor={colors.muted}
                value={form.durationDays}
                onChangeText={(v) => setField("durationDays", v)}
                keyboardType="number-pad"
                textAlign={textAlignStart}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>تاريخ البداية</Text>
          <TouchableOpacity
            style={styles.dateField}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="calendar-outline" size={20} color={colors.muted} />
            <Text style={styles.dateFieldText}>
              {formatDateDisplay(form.startDate || todayStr())}
            </Text>
          </TouchableOpacity>
          {showDatePicker ? (
            <DateTimePicker
              value={pickerDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onDateChange}
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

          <View style={styles.dialogActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelBtnText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createBtn, saving && styles.createBtnDisabled]}
              onPress={onSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.createBtnText}>
                  {editing ? "حفظ التعديلات" : "إنشاء البرنامج"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  newBtn: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingVertical: 12,
    marginBottom: 16,
  },
  newBtnDisabled: {
    opacity: 0.55,
  },
  newBtnText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 16,
    ...rtlText,
  },
  newBtnTextDisabled: {
    color: colors.muted,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
    ...rtlText,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: 12,
    marginBottom: 12,
  },
  cardBody: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  iconBtn: {
    padding: 4,
  },
  cardTitle: {
    flex: 1,
    color: colors.primary,
    fontWeight: "700",
    fontSize: 15,
    ...rtlText,
  },
  metaText: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 10,
    ...rtlText,
  },
  metaType: {
    color: colors.gold,
    fontWeight: "600",
  },
  pct: {
    color: colors.primary,
    fontWeight: "bold",
    fontSize: 13,
    marginBottom: 6,
    ...rtlText,
  },
  progressTrack: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  progressTrackRtl: {
    direction: "rtl",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignSelf: "flex-end",
  },
  progressFillRtl: {
    alignSelf: "flex-start",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  closeBtn: {
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 6,
    ...rtlText,
  },
  dialogSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 16,
    ...rtlText,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 6,
    ...rtlText,
  },
  typeRow: {
    flexDirection: row,
    gap: 8,
    marginBottom: 14,
  },
  typeChip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  typeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.soft,
  },
  typeChipText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
    ...rtlText,
  },
  typeChipTextActive: {
    color: colors.primary,
  },
  rowFields: {
    flexDirection: row,
    gap: 10,
  },
  halfField: {
    flex: 1,
  },
  dateField: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
    backgroundColor: colors.bg,
  },
  dateFieldText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    ...rtlText,
  },
  dateDoneBtn: {
    alignSelf: "flex-end",
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dateDoneText: {
    color: colors.primary,
    fontWeight: "700",
    ...rtlText,
  },
  dialogActions: {
    flexDirection: row,
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  cancelBtnText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 15,
    ...rtlText,
  },
  createBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.7 },
  createBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
    ...rtlText,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  progressModalHeader: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  progressModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    ...rtlText,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  saveBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
  },
  progressModalCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 20,
    marginHorizontal: 24,
    alignSelf: "center",
    width: "88%",
  },
  progressModalHint: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 10,
    ...rtlText,
  },
  tumunModalCount: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.primary,
    textAlign: "center",
    marginBottom: 4,
    ...rtlText,
  },
  tumunModalPct: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 16,
    ...rtlText,
  },
  stepperRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 16,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperBtnText: {
    fontSize: 26,
    fontWeight: "bold",
    color: colors.primary,
  },
  stepperValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.primary,
    flex: 1,
    textAlign: "center",
  },
  unsavedText: {
    fontSize: 13,
    color: colors.orange,
    fontWeight: "600",
    textAlign: "center",
    marginTop: -6,
    marginBottom: 10,
  },
  draftActions: {
    flexDirection: row,
    gap: 10,
    marginBottom: 6,
  },
  draftSaveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  draftCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.card,
  },
});
