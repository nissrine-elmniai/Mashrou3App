import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Keyboard,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import { rtlText, textAlignStart, fonts, row } from "../../constants/rtl";
import { GENDER_OPTIONS } from "../../constants/roles";
import { useApp } from "../../context/AppContext";
import {
  formatBirthDateLabel,
  parseLocalDate,
  dateToIsoLocal,
  toSlashDate,
  isPlaceholderBirthDate,
} from "../../lib/auth";
import { formatGenderLabel, updatePersonalInfo } from "../../lib/membersApi";

/** Même contrôle que la modale admin : chiffres, espaces et « + ». */
const PHONE_RE = /^[0-9+\s]+$/;

const LABELS = {
  firstName: "الاسم",
  lastName: "اللقب",
  phone: "رقم الهاتف",
  genre: "الجنس",
  birth: "تاريخ الميلاد",
  school: "المؤسسة التعليمية",
  level: "المستوى الدراسي",
  email: "البريد الإلكتروني",
};

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function maxBirthDate() {
  const date = startOfToday();
  date.setDate(date.getDate() - 1);
  return date;
}

function isPastBirthDate(iso) {
  if (isPlaceholderBirthDate(iso)) return false;
  const date = parseLocalDate(iso);
  if (!date) return false;
  return date.getTime() < startOfToday().getTime();
}

/**
 * Édition des infos personnelles par le membre connecté.
 * Valeurs initiales : objet getMemberProfileFields.
 * Écriture : updatePersonalInfo (7 colonnes profiles, jamais l'e-mail ni le hifz).
 */
export default function EditPersonalInfoModal({
  visible,
  onClose,
  onSaved,
  authId,
  member,
  bottomInset = 16,
}) {
  const { updateCurrentUserProfile } = useApp();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

  // Reprend les valeurs affichées à l'ouverture seulement, pour ne pas écraser la saisie.
  useEffect(() => {
    if (!visible) {
      setShowDatePicker(false);
      return;
    }
    const genre = formatGenderLabel(member?.genre);
    const birthIso = dateToIsoLocal(parseLocalDate(member?.dateNaissance)) || "";
    setForm({
      firstName: member?.firstName || "",
      lastName: member?.lastName || "",
      phone: member?.telephone || "",
      genre: genre === "ذكر" || genre === "أنثى" ? genre : "",
      birthDate: isPlaceholderBirthDate(birthIso) ? "" : birthIso,
      school: member?.ecole || "",
      level: member?.niveau || "",
    });
    // member est lu au moment où la modale s'ouvre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return undefined;
    }
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [visible]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const pickerDate = parseLocalDate(form.birthDate) || new Date(2010, 0, 1);

  const onDateChange = (event, selected) => {
    if (Platform.OS !== "ios") setShowDatePicker(false);
    if (event.type === "dismissed") return;
    if (selected) setField("birthDate", dateToIsoLocal(selected));
  };

  const handleSave = async () => {
    const firstClean = form.firstName.trim();
    const lastClean = form.lastName.trim();
    const phoneClean = form.phone.trim();
    const birthClean = form.birthDate.trim();
    const genre = form.genre === "ذكر" || form.genre === "أنثى" ? form.genre : "";

    if (!firstClean || !lastClean) {
      Alert.alert("تنبيه", "أدخل الاسم واللقب");
      return;
    }
    if (!phoneClean || !PHONE_RE.test(phoneClean)) {
      Alert.alert("تنبيه", "رقم الهاتف غير صالح");
      return;
    }
    if (!isPastBirthDate(birthClean)) {
      Alert.alert("تنبيه", "أدخل تاريخ ميلاد صالحاً في الماضي");
      return;
    }
    if (!genre) {
      Alert.alert("تنبيه", "اختر الجنس (ذكر أو أنثى)");
      return;
    }
    if (!authId) {
      Alert.alert("خطأ", "تعذّر حفظ المعلومات");
      return;
    }

    setSaving(true);
    try {
      const res = await updatePersonalInfo(authId, {
        firstName: firstClean,
        lastName: lastClean,
        phone: phoneClean,
        genre,
        dateNaissance: birthClean,
        school: form.school.trim(),
        level: form.level.trim(),
      });
      if (!res.ok) {
        Alert.alert("خطأ", "تعذّر حفظ المعلومات");
        return;
      }
      updateCurrentUserProfile({
        firstName: res.firstName,
        lastName: res.lastName,
        phone: res.phone,
        gender: res.genre,
        birthDate: toSlashDate(res.dateNaissance),
        school: res.school,
        level: res.level,
      });
      await onSaved?.();
      Alert.alert("تم حفظ المعلومات");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={saving ? undefined : onClose}
    >
      <View
        style={[
          styles.overlay,
          {
            paddingBottom:
              keyboardHeight > 0
                ? keyboardHeight + 8
                : Math.max(insets.bottom, bottomInset),
          },
        ]}
      >
        <View style={styles.card}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.cardContent}
          >
            <View style={styles.header}>
              <Text style={styles.title}>تعديل المعلومات الشخصية</Text>
              <TouchableOpacity
                onPress={saving ? undefined : onClose}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{LABELS.firstName}</Text>
            <TextInput
              style={styles.input}
              value={form.firstName}
              onChangeText={(v) => setField("firstName", v)}
              placeholder="الاسم"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>{LABELS.lastName}</Text>
            <TextInput
              style={styles.input}
              value={form.lastName}
              onChangeText={(v) => setField("lastName", v)}
              placeholder="اللقب"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>{LABELS.phone}</Text>
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={(v) => setField("phone", v)}
              placeholder="06xxxxxxxx"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>{LABELS.genre}</Text>
            <View style={styles.chipsRow}>
              {GENDER_OPTIONS.map((opt) => {
                const active = form.genre === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setField("genre", opt.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>{LABELS.birth}</Text>
            <TouchableOpacity
              style={styles.dateField}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.muted} />
              <Text
                style={[
                  styles.dateFieldText,
                  !form.birthDate && styles.datePlaceholder,
                ]}
              >
                {form.birthDate
                  ? formatBirthDateLabel(form.birthDate) || "—"
                  : "اختر تاريخ الميلاد"}
              </Text>
            </TouchableOpacity>
            {showDatePicker ? (
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={maxBirthDate()}
                onChange={onDateChange}
              />
            ) : null}
            {Platform.OS === "ios" && showDatePicker ? (
              <TouchableOpacity
                style={styles.dateDoneBtn}
                onPress={() => setShowDatePicker(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.dateDoneText}>تم</Text>
              </TouchableOpacity>
            ) : null}

            <Text style={styles.label}>{LABELS.school}</Text>
            <TextInput
              style={styles.input}
              value={form.school}
              onChangeText={(v) => setField("school", v)}
              placeholder="كلية العلوم"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>{LABELS.level}</Text>
            <TextInput
              style={styles.input}
              value={form.level}
              onChangeText={(v) => setField("level", v)}
              placeholder="السنة الثانية"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="done"
            />

            <View style={styles.readOnlyBlock}>
              <Text style={styles.readOnlyHint}>
                هذه المعلومات غير قابلة للتعديل من هنا
              </Text>
              <View style={styles.readOnlyRow}>
                <Text style={styles.readOnlyLabel}>{LABELS.email}</Text>
                <Text style={styles.readOnlyValue} numberOfLines={1}>
                  {member?.email || "—"}
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={saving ? undefined : handleSave}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.saveBtnText}>حفظ</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={saving ? undefined : onClose}
                activeOpacity={0.75}
              >
                <Text style={styles.cancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function emptyForm() {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    genre: "",
    birthDate: "",
    school: "",
    level: "",
  };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    maxHeight: "85%",
  },
  cardContent: {
    padding: 20,
  },
  header: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.text,
    ...rtlText,
  },
  label: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 6,
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
    backgroundColor: colors.inputBg,
    writingDirection: "rtl",
  },
  dateField: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    backgroundColor: colors.inputBg,
  },
  dateFieldText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  datePlaceholder: {
    color: colors.placeholder,
    fontFamily: fonts.regular,
  },
  dateDoneBtn: {
    alignSelf: "flex-end",
    marginTop: -6,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateDoneText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 15,
    ...rtlText,
  },
  chipsRow: {
    flexDirection: row,
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.inputBg,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.muted,
    ...rtlText,
  },
  chipTextActive: {
    color: colors.primary,
  },
  readOnlyBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginBottom: 4,
  },
  readOnlyHint: {
    fontSize: 12,
    color: colors.placeholder,
    marginBottom: 8,
    ...rtlText,
  },
  readOnlyRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    gap: 12,
  },
  readOnlyLabel: {
    fontSize: 13,
    color: colors.muted,
    ...rtlText,
  },
  readOnlyValue: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fonts.semiBold,
    textAlign: textAlignStart,
    writingDirection: "rtl",
  },
  actions: {
    marginTop: 12,
    gap: 10,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "white",
    fontFamily: fonts.bold,
    fontSize: 15,
    ...rtlText,
  },
  cancelBtn: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: "center",
  },
  cancelBtnText: {
    color: colors.muted,
    fontFamily: fonts.semiBold,
    fontSize: 15,
    ...rtlText,
  },
});
