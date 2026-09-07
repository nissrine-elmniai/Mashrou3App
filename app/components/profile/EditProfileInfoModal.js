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
import { updateMemberInfo } from "../../lib/membersApi";

/**
 * Édition des infos personnelles par le membre lui-même.
 * Colonnes écrites : profiles.phone / school / level (policy profiles_update_own).
 * Email (auth Supabase), genre (profiles.genre) et مقدار الحفظ restent en lecture seule.
 */
export default function EditProfileInfoModal({
  visible,
  onClose,
  onSaved,
  authId,
  email,
  gender,
  hifzAmount,
  phone,
  school,
  level,
  bottomInset = 16,
}) {
  const [form, setForm] = useState({ phone: "", school: "", level: "" });
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    setForm({
      phone: phone || "",
      school: school || "",
      level: level || "",
    });
  }, [visible, phone, school, level]);

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
    const phoneClean = form.phone.trim();
    const schoolClean = form.school.trim();
    const levelClean = form.level.trim();

    // Un champ vidé ferait réapparaître l'ancienne valeur de member_applications
    // au rechargement (repli de getMemberProfileFields).
    if (!phoneClean || !schoolClean || !levelClean) {
      Alert.alert("تنبيه", "املأ جميع الحقول قبل الحفظ");
      return;
    }
    if (!authId) {
      Alert.alert("تنبيه", "تعذر تحديد حسابك — أعد تسجيل الدخول");
      return;
    }

    setSaving(true);
    try {
      const res = await updateMemberInfo(authId, {
        phone: phoneClean,
        school: schoolClean,
        level: levelClean,
      });
      if (!res.ok) {
        Alert.alert("خطأ", res.error || "تعذر حفظ التعديلات");
        return;
      }
      Alert.alert("تم", "تم تحديث معلوماتك بنجاح");
      onSaved?.({
        phone: res.telephone,
        school: res.ecole,
        level: res.niveau,
      });
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

            <Text style={styles.label}>رقم الهاتف</Text>
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

            <Text style={styles.label}>المدرسة</Text>
            <TextInput
              style={styles.input}
              value={form.school}
              onChangeText={(v) => setField("school", v)}
              placeholder="كلية العلوم"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>المستوى التعليمي</Text>
            <TextInput
              style={styles.input}
              value={form.level}
              onChangeText={(v) => setField("level", v)}
              placeholder="السنة الثانية"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="done"
              onSubmitEditing={saving ? undefined : handleSave}
            />

            <View style={styles.readOnlyBlock}>
              <Text style={styles.readOnlyHint}>
                هذه المعلومات غير قابلة للتعديل من هنا
              </Text>
              <ReadOnlyRow label="البريد الإلكتروني" value={email} />
              <ReadOnlyRow label="الجنس" value={gender} />
              <ReadOnlyRow label="مقدار الحفظ" value={hifzAmount} />
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
