import React, { useEffect, useState } from "react";
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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import { row, rtlText, rtlTextBold, fonts, arrowBack, textAlignStart } from "../../constants/rtl";
import { useApp } from "../../context/AppContext";
import { ROLES } from "../../constants/roles";
import { getSupervisorActiveSeance } from "../../lib/membersApi";
import {
  getMySeance,
  resolveAdminProfile,
  getConversation,
  markConversationRead,
  sendMessage,
  subscribeConversation,
} from "../../lib/messagesApi";

function formatTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

function normalizeMessage(m, myAuthId) {
  return {
    id: m.id,
    text: m.contenu || "",
    sent: m.sender_id === myAuthId,
    time: formatTime(m.created_at),
    image: m.image_url || null,
  };
}

export default function ChatConversationScreen({ navigation, route }) {
  const { contactId, contactName, contactAvatarLetter, contactRole } = route.params || {};
  const { currentUser, supabaseSession } = useApp();
  const isAdmin = contactId === "admin" || contactRole === "admin";

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [conversation, setConversation] = useState({ otherId: null, seanceId: null });

  const authId = supabaseSession?.user?.id || currentUser?.authId || null;
  const role = currentUser?.role;
  const isSupervisor = role === ROLES.SUPERVISOR;
  const isMember = role === ROLES.MEMBER;

  // Chargement de la conversation réelle (au lieu de l'ancien mock
  // INITIAL_MESSAGES) : résolution du correspondant + séance selon le rôle.
  // otherId ne contient JAMAIS la chaîne "admin" : uniquement un UUID de
  // profiles.id (résolu), ou null si la résolution a échoué.
  useEffect(() => {
    if (!authId) return;
    let cancelled = false;
    (async () => {
      try {
        let otherId = null;
        let seanceId = null;
        let failReason = null;

        if (isMember) {
          if (isAdmin) {
            failReason =
              "لا يمكن التواصل مع الإدارة مباشرة. يُرجى مراسلة مشرف الحصة.";
          } else {
            // Chat membre <-> son superviseur : contactId = UUID du superviseur
            const mySeance = await getMySeance();
            if (mySeance?.ok && mySeance.seance) {
              seanceId = mySeance.seance.id;
              otherId = contactId;
            } else {
              failReason = mySeance?.error || "لم يتم العثور على حصة نشطة";
            }
          }
        } else if (isAdmin && isSupervisor) {
          // Chat superviseur <-> admin : UUID réel, ou repli sur le compte admin racine.
          if (contactId && contactId !== "admin") {
            otherId = contactId;
          } else {
            const res = await resolveAdminProfile();
            if (res?.ok && res.admin) {
              otherId = res.admin.id;
            } else {
              failReason = res?.error || "لم يتم العثور على حساب الإدارة";
            }
          }
        } else if (role === ROLES.ADMIN) {
          // Admin <-> superviseur uniquement (RG6). contactRole est passé par
          // AdminChatScreen ; sans "supervisor" on refuse (porte dérobée membre).
          if (contactRole !== ROLES.SUPERVISOR) {
            failReason = "الدردشة متاحة مع المشرفين فقط.";
          } else {
            otherId = contactId;
          }
        } else if (isSupervisor) {
          // Chat superviseur <-> membre : séance active du superviseur
          const seanceRes = await getSupervisorActiveSeance(authId);
          seanceId =
            seanceRes?.ok && seanceRes.seance ? seanceRes.seance.id : null;
          otherId = contactId;
        }

        if (cancelled) return;
        setConversation({ otherId, seanceId });
        if (!otherId) {
          if (failReason) {
            Alert.alert("تعذر فتح المحادثة", failReason);
          }
          navigation.goBack();
          return;
        }

        const res = await getConversation({ otherUserId: otherId, seanceId });
        if (cancelled || !res.ok) return;
        setMessages((res.messages || []).map((m) => normalizeMessage(m, authId)));
        markConversationRead({ otherUserId: otherId, seanceId });
      } catch (e) {
        console.warn(
          "ChatConversationScreen: échec de chargement —",
          e?.message || e
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authId, contactId, contactRole, isAdmin, isSupervisor, isMember, navigation]);

  // Abonnement Realtime aux nouveaux messages du binôme
  useEffect(() => {
    if (!authId || !conversation.otherId) return;
    const unsubscribe = subscribeConversation(
      { otherUserId: conversation.otherId, myUserId: authId },
      (msg) => {
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id)
            ? prev
            : [...prev, normalizeMessage(msg, authId)]
        );
      }
    );
    return unsubscribe;
  }, [authId, conversation.otherId]);

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    if (!conversation.otherId || !authId) return;
    setInputText("");
    const res = await sendMessage({
      recipientId: conversation.otherId,
      seanceId: conversation.seanceId,
      contenu: trimmed,
    });
    if (!res.ok) {
      setInputText(trimmed);
      Alert.alert("تعذر الإرسال", res.error || "حاول مرة أخرى");
      return;
    }
    if (res.message) {
      setMessages((prev) =>
        prev.some((m) => m.id === res.message.id)
          ? prev
          : [...prev, normalizeMessage(res.message, authId)]
      );
    }
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name={arrowBack} size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={[styles.memberAvatar, isAdmin && { backgroundColor: colors.primary }]}>
            <Text style={isAdmin ? styles.memberAvatarTextWhite : styles.memberAvatarText}>
              {contactAvatarLetter}
            </Text>
          </View>
          <Text style={styles.contactName} numberOfLines={1}>
            {contactName}
          </Text>
        </View>
        <FlatList
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.listContent}
        />

        <View style={styles.inputBar}>
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
            <Ionicons name="send" size={20} color="white" style={styles.sendIcon} />
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
