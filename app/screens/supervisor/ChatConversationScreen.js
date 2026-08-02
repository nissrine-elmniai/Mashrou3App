import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Paperclip, Send } from "lucide-react-native";
import { colors, radii } from "../../constants/theme";
import { row, rtlText, rtlTextBold, fonts, arrowBack, textAlignStart } from "../../constants/rtl";

const INITIAL_MESSAGES = [
  { id: "m1", text: "السلام عليكم، كيف تسير المراجعة هذا الأسبوع؟", sent: false, time: "10:30 ص" },
  { id: "m2", text: "وعليكم السلام، الحمد لله الأمور جيدة", sent: true, time: "10:31 ص" },
  { id: "m3", text: "هل حضرت الحصة أمس؟", sent: false, time: "10:32 ص" },
  { id: "m4", text: "نعم، حضرت وأنهيت الحفظ المطلوب ✓", sent: true, time: "10:33 ص" },
];

export default function ChatConversationScreen({ navigation, route }) {
  const { contactId, contactName, contactAvatarLetter } = route.params || {};
  const isAdmin = contactId === "admin";

  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState("");

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const time = new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { id: `local_${Date.now()}`, text: trimmed, sent: true, time }]);
    setInputText("");
  };

  const renderMessage = ({ item }) => {
    const isMine = item.sent;
    return (
      <View style={[styles.bubbleRow, { justifyContent: isMine ? "flex-start" : "flex-end" }]}>
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.bubbleImage} resizeMode="cover" />
          ) : null}
          {item.text ? (
            <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextOther]}>
              {item.text}
            </Text>
          ) : null}
          <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeMine : styles.bubbleTimeOther]}>
            {item.time}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.card} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name={arrowBack} size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.avatarWrap}>
          <View style={[styles.memberAvatar, isAdmin && { backgroundColor: colors.primary }]}>
            <Text style={isAdmin ? styles.memberAvatarTextWhite : styles.memberAvatarText}>
              {contactAvatarLetter}
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
        </View>
        <Text style={styles.contactName} numberOfLines={1}>
          {contactName}
        </Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.listContent}
        />

        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} activeOpacity={0.7}>
            <Paperclip size={22} color={colors.muted} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="اكتب رسالة..."
            placeholderTextColor={colors.placeholder}
            textAlign={textAlignStart}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend} activeOpacity={0.8}>
            <Send size={20} color="white" style={styles.sendIcon} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },

  header: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 2 },
  avatarWrap: { position: "relative" },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 15 },
  memberAvatarTextWhite: { color: "white", fontFamily: fonts.bold, fontSize: 15 },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.card,
  },
  contactName: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.text, ...rtlTextBold },

  listContent: { paddingVertical: 12 },
  bubbleRow: { flexDirection: row, paddingHorizontal: 16, marginVertical: 4 },
  bubble: {
    maxWidth: "80%",
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.card, borderBottomLeftRadius: 4 },
  bubbleImage: { width: 180, height: 140, borderRadius: radii.md, marginBottom: 6 },
  bubbleText: { fontSize: 15, fontFamily: fonts.regular, ...rtlText },
  bubbleTextMine: { color: "white" },
  bubbleTextOther: { color: colors.text },
  bubbleTime: { fontSize: 11, marginTop: 4, ...rtlText },
  bubbleTimeMine: { color: "rgba(255,255,255,0.7)" },
  bubbleTimeOther: { color: colors.muted },

  inputBar: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attachBtn: { padding: 6 },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: { transform: [{ rotate: "180deg" }] },
});
