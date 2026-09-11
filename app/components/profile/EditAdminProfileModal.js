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
import { updateOwnProfile } from "../../lib/auth";
import { PROFILE_COLUMN_LABELS as L } from "./profileColumnLabels";

const PHONE_RE = /^[0-9+\s]+$/;

/**
 * Édition minimale du profil admin : الاسم، اللقب، الهاتف.
 * N'envoie pas genre / date_naissance (laissés intacts en base).
 */
export default function EditAdminProfileModal({
  visible,
  onClose,
  onSaved,
  authId,
  firstName,
  lastName,
  phone,
  bottomInset = 16,
}) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    setForm({
      firstName: firstName || "",
      lastName: lastName || "",
      phone: phone || "",
    });
  }, [visible, firstName, lastName, phone]);

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

    if (!firstClean || !lastClean) {
      Alert.alert("تنبيه", "أدخل الاسم والنسب");
      return;
    }
    if (phoneClean && !PHONE_RE.test(phoneClean)) {
      Alert.alert("تنبيه", "رقم الهاتف غير صالح");
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
      });
      if (!res.ok) {
        Alert.alert("خطأ", res.error || "تعذّر حفظ التعديلات");
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

            <Text style={styles.label}>{L.first_name}</Text>
            <TextInput
              style={styles.input}
              value={form.firstName}
              onChangeText={(v) => setField("firstName", v)}
              placeholder="الاسم"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>{L.last_name}</Text>
            <TextInput
              style={styles.input}
              value={form.lastName}
              onChangeText={(v) => setField("lastName", v)}
              placeholder="النسب"
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>{L.phone}</Text>
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
