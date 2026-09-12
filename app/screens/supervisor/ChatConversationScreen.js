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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import { row, rtlText, rtlTextBold, fonts, arrowBack, textAlignStart } from "../../constants/rtl";
import { useApp } from "../../context/AppContext";
import { ROLES } from "../../constants/roles";
import { getSupervisorActiveSeance } from "../../lib/membersApi";
import {
  getMyAcceptedSeance,
  resolveAdminProfile,
  getConversation,
  markConversationRead,
  sendMessage,
  subscribeConversation,
} from "../../lib/messagesApi";
import ProfileAvatar from "../../components/ProfileAvatar";
import { resolvePublicAvatarUrl } from "../../lib/avatarApi";

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
  const {
    contactId,
    contactName,
    contactAvatarLetter,
    contactAvatarUrl,
    contactRole,
    seanceId: routeSeanceId,
  } = route.params || {};
  const { currentUser, supabaseSession } = useApp();
  const isAdmin = contactId === "admin" || contactRole === "admin";

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [conversation, setConversation] = useState({ otherId: null, seanceId: null });
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState(contactAvatarUrl || null);

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
            // Conversation permanente avec le superviseur assigné (même sans
            // historique). On ancre l'envoi sur la séance où ce superviseur
            // est réellement lié, sinon RLS refuse le message.
            const assignedRes = await getMyAcceptedSeance({
              seanceId: routeSeanceId || null,
              superviseurId: contactId || null,
            });
            const assigned = assignedRes?.ok ? assignedRes.seance : null;
            if (assigned?.superviseur_id) {
              seanceId = assigned.id;
              otherId = assigned.superviseur_id;
            } else if (routeSeanceId && contactId) {
              seanceId = routeSeanceId;
              otherId = contactId;
            } else {
              failReason =
                assignedRes?.error || "لم يتم العثور على حصة مرتبطة بالمشرف";
            }
          }
        } else if (isAdmin && isSupervisor) {
          // Chat superviseur <-> admin : UUID réel, ou repli sur le compte admin racine.
          if (contactId && contactId !== "admin") {
            otherId = contactId;
            if (!headerAvatarUrl) {
              setHeaderAvatarUrl(resolvePublicAvatarUrl(contactId, null));
            }
          } else {
            const res = await resolveAdminProfile();
            if (res?.ok && res.admin) {
              otherId = res.admin.id;
              setHeaderAvatarUrl((prev) =>
                prev || resolvePublicAvatarUrl(res.admin.id, res.admin.avatar_url)
              );
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
          // Chat superviseur <-> membre : séance passée depuis l'inbox
          // (groupe sélectionné), sinon première séance active.
          if (routeSeanceId) {
            seanceId = routeSeanceId;
          } else {
            const seanceRes = await getSupervisorActiveSeance(authId);
            seanceId =
              seanceRes?.ok && seanceRes.seance ? seanceRes.seance.id : null;
          }
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

        // Côté membre : un seul fil avec le superviseur, toutes saisons
        // confondues. L'envoi reste lié à la séance courante (RG6).
        const historySeanceId = isMember ? null : seanceId;
        const res = await getConversation({
          otherUserId: otherId,
          seanceId: historySeanceId,
        });
        if (cancelled || !res.ok) return;
        setMessages((res.messages || []).map((m) => normalizeMessage(m, authId)));
        markConversationRead({ otherUserId: otherId, seanceId: historySeanceId });
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
  }, [authId, contactId, contactRole, routeSeanceId, isAdmin, isSupervisor, isMember, navigation]);

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
    if (isMember && !conversation.seanceId) {
      Alert.alert("تعذر الإرسال", "لا توجد حصة مرتبطة بالمشرف");
      return;
    }
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
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.headerWrap}>
          <LinearGradient colors={colors.gradientHeader} style={styles.header}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="رجوع"
            >
              <Ionicons name={arrowBack} size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.avatarWrap}>
              <ProfileAvatar
                userId={conversation.otherId || contactId}
                avatarUrl={headerAvatarUrl}
                cacheKey={headerAvatarUrl || conversation.otherId || contactId}
                fallbackLetter={contactAvatarLetter || "؟"}
                size={42}
                softBackgroundColor="rgba(255,255,255,0.28)"
                letterColor="#fff"
              />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.contactName} numberOfLines={1}>
                {contactName}
              </Text>
            </View>
          </LinearGradient>
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

  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  header: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderRadius: radii.lg,
    overflow: "hidden",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: { position: "relative" },
  headerText: { flex: 1 },
  contactName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#fff",
    ...rtlTextBold,
  },

  listContent: { paddingVertical: 12 },
  bubbleRow: { flexDirection: row, paddingHorizontal: 16, marginVertical: 4 },
  bubble: {
    maxWidth: "80%",
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    borderBottomLeftRadius: 4,
  },
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
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
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
