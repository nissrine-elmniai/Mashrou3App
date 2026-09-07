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
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import { rtlText, textAlignStart, fonts, row } from "../../constants/rtl";
import { GENDER_OPTIONS } from "../../constants/roles";
import { updateOwnProfile } from "../../lib/auth";
import { formatGenderLabel } from "../../lib/membersApi";

/**
 * Édition des infos personnelles par le superviseur lui-même.
 * Colonnes écrites : profiles.first_name / last_name / phone / genre
 * (policy profiles_update_own). L'e-mail Auth reste en lecture seule.
 */
export default function EditSupervisorProfileModal({
  visible,
  onClose,
  onSaved,
  authId,
  firstName,
  lastName,
  phone,
  gender,
  email,
  bottomInset = 16,
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    genre: "",
  });
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    const genre = formatGenderLabel(gender);
    setForm({
      firstName: firstName || "",
      lastName: lastName || "",
      phone: phone || "",
      genre: genre === "ذكر" || genre === "أنثى" ? genre : "",
    });
  }, [visible, firstName, lastName, phone, gender]);

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

  const handleSave = async () => {
    const firstClean = form.firstName.trim();
    const lastClean = form.lastName.trim();
    const phoneClean = form.phone.trim();

    if (!firstClean || !lastClean || !phoneClean) {
      Alert.alert("تنبيه", "املأ جميع الحقول قبل الحفظ");
      return;
    }
    if (!authId) {
      Alert.alert("تنبيه", "تعذر تحديد حسابك — أعد تسجيل الدخول");
      return;
    }

    setSaving(true);
    try {
      const res = await updateOwnProfile(authId, {
        firstName: firstClean,
        lastName: lastClean,
        phone: phoneClean,
        genre: form.genre,
      });
      if (!res.ok) {
        Alert.alert("خطأ", res.error || "تعذر حفظ التعديلات");
        return;
      }
      Alert.alert("تم", "تم تحديث معلوماتك بنجاح");
      onSaved?.(res.profile);
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

            <Text style={styles.label}>الاسم</Text>
            <TextInput
              style={styles.input}
              value={form.firstName}
              onChangeText={(v) => setField("firstName", v)}
              placeholder="الاسم"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>النسب</Text>
            <TextInput
              style={styles.input}
              value={form.lastName}
              onChangeText={(v) => setField("lastName", v)}
              placeholder="النسب"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>رقم الهاتف</Text>
            <TextInput
              style={styles.input}
              value={form.phone}
              onChangeText={(v) => setField("phone", v)}
              placeholder="06xxxxxxxx"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
              textAlign={textAlignStart}
              returnKeyType="done"
            />

            <Text style={styles.label}>الجنس</Text>
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
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.readOnlyBlock}>
              <Text style={styles.readOnlyHint}>
                هذه المعلومات غير قابلة للتعديل من هنا
              </Text>
              <ReadOnlyRow label="البريد الإلكتروني" value={email} />
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

function ReadOnlyRow({ label, value }) {
  return (
    <View style={styles.readOnlyRow}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <Text style={styles.readOnlyValue} numberOfLines={1}>
        {value || "—"}
      </Text>
    </View>
  );
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
