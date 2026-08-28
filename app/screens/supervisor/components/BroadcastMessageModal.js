import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Keyboard,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../../constants/theme";
import { rtlText, rtlTextBold, row, fonts, textAlignStart } from "../../../constants/rtl";
import { sendBroadcastToMembers } from "../../../lib/messagesApi";

/**
 * Modal de diffusion : un message identique envoyé en N conversations 1-à-1.
 */
export default function BroadcastMessageModal({
  visible,
  onClose,
  memberIds = [],
  seanceId,
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();

  const count = memberIds.length;

  // Modales RN : paddingBottom dynamique (pattern AdminSeasonsScreen) — plus fiable que KAV seul.
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
    if (sending) return;
    setText("");
    onClose();
  };

  const runSend = async () => {
    setSending(true);
    const res = await sendBroadcastToMembers({
      memberIds,
      seanceId,
      contenu: text,
    });
    setSending(false);

    if (!res.ok && res.sentCount === 0) {
      Alert.alert("تعذر الإرسال", res.error || "تعذر إرسال الرسالة");
      return;
    }

    if (res.failedCount > 0) {
      Alert.alert(
        "إرسال جزئي",
        `تم الإرسال إلى ${res.sentCount} من ${res.total} أعضاء`
      );
      setText("");
      onClose();
      return;
    }

    Alert.alert("تم الإرسال", `تم الإرسال إلى ${res.sentCount} عضو بنجاح`);
    setText("");
    onClose();
  };

  const handleSendPress = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      Alert.alert("تنبيه", "اكتب نص الرسالة");
      return;
    }
    Alert.alert(
      "تأكيد الإرسال",
      `سيتم إرسال هذه الرسالة إلى ${count} عضو. هل تريد المتابعة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "إرسال", onPress: runSend },
      ]
    );
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
                ? keyboardHeight
                : Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.sheetContent}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>إرسال رسالة للجميع</Text>
              <TouchableOpacity onPress={handleClose} disabled={sending} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.recipientHint}>
              سيتم الإرسال إلى {count} عضو
            </Text>

            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="اكتب رسالة..."
              placeholderTextColor={colors.placeholder}
              textAlign={textAlignStart}
              multiline
              editable={!sending}
            />

            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={handleSendPress}
              disabled={sending}
              activeOpacity={0.85}
            >
              {sending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Text style={styles.sendBtnText}>إرسال</Text>
                  <Ionicons name="send" size={18} color="white" style={styles.sendIcon} />
                </>
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
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: "88%",
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 12,
  },
  sheetHeader: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.text,
    ...rtlTextBold,
  },
  recipientHint: {
    fontSize: 14,
    color: colors.primary,
    fontFamily: fonts.medium,
    marginBottom: 12,
    ...rtlText,
  },
  input: {
    minHeight: 120,
    maxHeight: 180,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  sendBtn: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  sendBtnDisabled: { opacity: 0.7 },
  sendBtnText: {
    color: "white",
    fontFamily: fonts.bold,
    fontSize: 16,
    ...rtlTextBold,
  },
  sendIcon: { transform: [{ rotate: "180deg" }] },
});
