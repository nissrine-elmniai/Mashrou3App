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
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
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
  scheduleMemberProgressDelta,
} from "../../lib/progressApi";
import { getActiveRegularSeason } from "../../lib/seasonScope";

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
  const {
    getMemberPrograms,
    saveMemberProgram,
    deleteMemberProgram,
    adjustMemberProgramTumuns,
    seasons,
  } = useApp();

  const programs = getMemberPrograms();
  const [modalVisible, setModalVisible] = useState(false);
  const [progressModal, setProgressModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const activeSeasonIdRef = useRef(null);
  activeSeasonIdRef.current = getActiveRegularSeason(seasons)?.id ?? null;

  useEffect(
    () => () => {
      flushMemberProgressDelta();
    },
    []
  );

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, startDate: todayStr() });
    setModalVisible(true);
  };

  const openEdit = (program) => {
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

  const handleSave = () => {
    const existing = editingId
      ? programs.find((program) => program.id === editingId)
      : null;
    const result = saveMemberProgram({
      id: editingId || undefined,
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
  };

  const confirmDelete = (program) => {
    Alert.alert(
      "حذف البرنامج",
      `هل تريد حذف «${program.title}»؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: () => {
            const result = deleteMemberProgram(program.id);
            if (!result.ok) Alert.alert("خطأ", result.error);
          },
        },
      ]
    );
  };

  const closeProgressModal = () => {
    flushMemberProgressDelta();
    setProgressModal(null);
  };

  const quickUpdateProgress = (program) => {
    setProgressModal(program);
  };

  const handleAdjustInModal = (delta) => {
    if (!progressModal) return;
    const result = adjustMemberProgramTumuns(progressModal.id, delta);
    if (!result.ok || result.unchanged) return;
    if (isHifzProgram(result.program)) {
      scheduleMemberProgressDelta({
        delta,
        saisonId: activeSeasonIdRef.current,
        notes: result.program.title || null,
      });
    }
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

  return (
    <View>
      <TouchableOpacity style={styles.newBtn} onPress={openCreate} activeOpacity={0.85}>
        <Ionicons name="add" size={20} color="white" />
        <Text style={styles.newBtnText}>برنامج جديد</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>برامج الحفظ</Text>

      {programs.length === 0 ? (
        <EmptyState text="لا يوجد برنامج بعد — اضغط «برنامج جديد»" />
      ) : (
        programs.map((program) => (
          <MemberProgramCard
            key={program.id}
            program={program}
            onEdit={() => openEdit(program)}
            onDelete={() => confirmDelete(program)}
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
            <Text style={styles.modalTitle}>تحديث التقدم</Text>
            <Text style={styles.progressModalHint}>
              {progressProgram?.title}
            </Text>
            {progressProgram && !isHifzProgram(progressProgram) ? (
              <Text style={styles.progressModalHint}>
                برنامج مراجعة — لا يغيّر موضعك في القرآن
              </Text>
            ) : null}

            {progressProgram ? (
              <>
                <Text style={styles.tumunModalCount}>
                  {progressProgram.completedTumuns} / {progressProgram.totalTumuns}{" "}
                  أثمان
                </Text>
                <Text style={styles.tumunModalPct}>
                  {progressProgram.progression}%
                </Text>

                <View style={styles.stepperRow}>
                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      progressProgram.completedTumuns <= 0 &&
                        styles.stepperBtnDisabled,
                    ]}
                    onPress={() => handleAdjustInModal(-1)}
                    disabled={progressProgram.completedTumuns <= 0}
                  >
                    <Text style={styles.stepperBtnText}>−</Text>
                  </TouchableOpacity>

                  <Text style={styles.stepperValue}>
                    {progressProgram.completedTumuns}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.stepperBtn,
                      progressProgram.completedTumuns >=
                        progressProgram.totalTumuns && styles.stepperBtnDisabled,
                    ]}
                    onPress={() => handleAdjustInModal(1)}
                    disabled={
                      progressProgram.completedTumuns >= progressProgram.totalTumuns
                    }
                  >
                    <Text style={styles.stepperBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            <TouchableOpacity
              style={styles.saveBtn}
              onPress={closeProgressModal}
            >
              <Text style={styles.saveBtnText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MemberProgramCard({
  program,
  onEdit,
  onDelete,
  onPress,
  onProgressPress,
}) {
  const status = programStatus(program);
  const pct = Math.min(100, Math.max(0, Number(program.progression) || 0));

  return (
    <View style={styles.card}>
      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleGroup}>
          <Ionicons name="book-outline" size={18} color={colors.primary} />
          <Text style={styles.cardTitle} numberOfLines={1}>
            {program.title}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={onEdit} hitSlop={8}>
            <Ionicons name="create-outline" size={20} color="#1976D2" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onDelete} hitSlop={8}>
            <Ionicons name="trash-outline" size={20} color={colors.red} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.cardBody} onPress={onPress} activeOpacity={0.9}>

          <View style={styles.badgeRow}>
            <View
              style={
                isHifzProgram(program) ? styles.badgeGreen : styles.badgeGold
              }
            >
              <Text
                style={
                  isHifzProgram(program)
                    ? styles.badgeGreenText
                    : styles.badgeGoldText
                }
              >
                {isHifzProgram(program) ? "حفظ" : "مراجعة"}
              </Text>
            </View>
            <View style={styles.badgeGreen}>
              <Text style={styles.badgeGreenText}>{program.nbHizb} أحزاب</Text>
            </View>
            <View style={styles.badgeGold}>
              <Text style={styles.badgeGoldText}>{program.durationDays} يوم</Text>
            </View>
          </View>

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={14} color={colors.muted} />
          <Text style={styles.metaText}>البداية: {program.startDate}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={14} color={colors.muted} />
          <Text style={styles.metaText}>{status}</Text>
        </View>

        <TouchableOpacity onPress={onProgressPress} activeOpacity={0.85}>
          <View style={styles.progressHead}>
            <Text style={styles.pct}>
              {program.completedTumuns}/{program.totalTumuns} أثمان · {pct}%
            </Text>
            <Text style={styles.progressLabel}>التقدم</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
}

function ProgramFormModal({ visible, editing, form, onChange, onClose, onSave }) {
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
              style={styles.createBtn}
              onPress={onSave}
              activeOpacity={0.85}
            >
              <Text style={styles.createBtnText}>
                {editing ? "حفظ التعديلات" : "إنشاء البرنامج"}
              </Text>
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
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    marginBottom: 16,
  },
  newBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
    ...rtlText,
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
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  cardTitleGroup: {
    flex: 1,
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  cardActions: {
    flexDirection: row,
    alignItems: "center",
    gap: 4,
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
  badgeRow: {
    flexDirection: row,
    gap: 8,
    marginBottom: 8,
  },
  badgeGreen: {
    backgroundColor: colors.soft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  badgeGreenText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
    ...rtlText,
  },
  badgeGold: {
    backgroundColor: "#FFF8E1",
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  badgeGoldText: {
    color: "#F57F17",
    fontSize: 12,
    fontWeight: "600",
    ...rtlText,
  },
  metaRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  metaText: {
    color: colors.muted,
    fontSize: 13,
    ...rtlText,
  },
  progressHead: {
    flexDirection: row,
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 6,
  },
  pct: {
    color: colors.primary,
    fontWeight: "bold",
    ...rtlText,
  },
  progressLabel: {
    color: colors.muted,
    fontSize: 13,
    ...rtlText,
  },
  progressTrack: {
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignSelf: "flex-end",
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
    paddingVertical: 14,
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
    paddingVertical: 14,
    alignItems: "center",
  },
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 14,
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
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
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
    fontSize: 28,
    fontWeight: "bold",
    color: colors.primary,
    flex: 1,
    textAlign: "center",
  },
});
