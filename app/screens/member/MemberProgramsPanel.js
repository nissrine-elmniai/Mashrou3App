import React, { useEffect, useState } from "react";
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

const EMPTY_FORM = {
  title: "",
  nbHizb: "",
  durationDays: "",
  startDate: "",
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
    updateMemberProgramProgress,
  } = useApp();

  const programs = getMemberPrograms();
  const [modalVisible, setModalVisible] = useState(false);
  const [progressModal, setProgressModal] = useState(null);
  const [progressDraft, setProgressDraft] = useState("0");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

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
      progression: existing?.progression ?? 0,
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

  const quickUpdateProgress = (program) => {
    setProgressDraft(String(program.progression ?? 0));
    setProgressModal(program);
  };

  const saveProgress = () => {
    if (!progressModal) return;
    const result = updateMemberProgramProgress(progressModal.id, progressDraft);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return;
    }
    setProgressModal(null);
  };

  const openDetails = (program) => {
    navigation.navigate("ProgrammeDetails", {
      programme: {
        id: program.id,
        nom: program.title,
        nbHizb: program.nbHizb,
        duree: program.durationDays,
        progression: program.progression,
        dateDebut: program.startDate,
        statut: programStatus(program) === "البرنامج منتهي" ? "terminé" : "en cours",
      },
    });
  };

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
        visible={!!progressModal}
        transparent
        animationType="fade"
        onRequestClose={() => setProgressModal(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setProgressModal(null)}
          />
          <View style={styles.progressModalCard}>
            <Text style={styles.modalTitle}>تحديث التقدم</Text>
            <Text style={styles.progressModalHint}>
              {progressModal?.title} — أدخل النسبة من 0 إلى 100
            </Text>
            <TextInput
              style={styles.input}
              value={progressDraft}
              onChangeText={setProgressDraft}
              keyboardType="number-pad"
              textAlign={textAlignStart}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveProgress}>
              <Text style={styles.saveBtnText}>حفظ</Text>
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
            <Text style={styles.pct}>{pct}%</Text>
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
});
