import React, { useState, useEffect } from "react";
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
import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "../lib/supabase";
import { colors, radii } from "../constants/theme";
import { rtlText, textAlignStart, fonts, row } from "../constants/rtl";

export default function ChangePasswordModal({ visible, onClose, bottomInset = 16 }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

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

  const handleClose = () => {
    setNewPassword("");
    setConfirmPassword("");
    onClose();
  };

  const savePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("تنبيه", "كلمة المرور قصيرة جداً (6 أحرف على الأقل)");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("تنبيه", "كلمة المرور غير متطابقة");
      return;
    }

    setSaving(true);
    try {
      if (!isSupabaseConfigured()) {
        Alert.alert("تنبيه", "Supabase غير مفعّل — لا يمكن تغيير كلمة المرور حالياً.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        Alert.alert("خطأ", mapSupabaseAuthError(error));
        return;
      }

      Alert.alert("تم", "تم تغيير كلمة المرور بنجاح");
      handleClose();
    } catch (e) {
      Alert.alert("خطأ", mapSupabaseAuthError(e) || "تعذر تحديث كلمة المرور");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
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
              <Text style={styles.title}>تغيير كلمة المرور</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>كلمة المرور الجديدة</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              textAlign={textAlignStart}
              returnKeyType="next"
            />

            <Text style={styles.label}>تأكيد كلمة المرور</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.placeholder}
              secureTextEntry
              textAlign={textAlignStart}
              returnKeyType="done"
              onSubmitEditing={saving ? undefined : savePassword}
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={saving ? undefined : savePassword}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.saveBtnText}>حفظ</Text>
              )}
            </TouchableOpacity>
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
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
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
});
