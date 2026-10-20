import React, { useEffect, useRef, useState } from "react";
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
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSubmitLock } from "../../lib/useSubmitLock";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import {
  row,
  rtlText,
  rtlTextBold,
  fonts,
  arrowBack,
  textAlignStart,
} from "../../constants/rtl";
import { useApp } from "../../context/AppContext";
import {
  sendGroupMessage,
  subscribeGroupMessages,
  markGroupRead,
  resolvePublicGroupAvatarUrl,
} from "../../lib/chatGroupsApi";
import {
  cachedChatGroup,
  cachedGroupMessages,
} from "../../lib/messagingOfflineReads";
import { OFFLINE_UNAVAILABLE_MESSAGE } from "../../lib/offlineCache";
import { isOffline } from "../../lib/networkState";
import { requireOnline } from "../../lib/toast";
import { useOfflineReload } from "../../hooks/useOfflineReload";
import { supabase } from "../../lib/supabase";
import ProfileAvatar from "../../components/ProfileAvatar";
import ChatBubbleImage from "../../components/ChatBubbleImage";

function formatTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

function senderDisplayName(sender) {
  if (!sender) return "";
  return `${sender.first_name || ""} ${sender.last_name || ""}`.trim();
}

function normalizeGroupMessage(m, myAuthId) {
  const sender = m.sender || {};
  return {
    id: m.id,
    text: m.contenu || "",
    sent: m.sender_id === myAuthId,
    time: formatTime(m.created_at),
    image: m.image_url || null,
    senderId: m.sender_id,
    senderName: senderDisplayName(sender),
  };
}

export default function GroupChatScreen({ navigation, route }) {
  const {
    groupId,
    groupName: routeGroupName,
    groupAvatarUrl: routeAvatarUrl,
  } = route.params || {};
  const { currentUser, supabaseSession } = useApp();
  const authId = supabaseSession?.user?.id || currentUser?.authId || null;

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  /** Verrou synchrone : un seul envoi en cours (connexion lente). */
  const { busy: sending, run: runSend } = useSubmitLock();
  const [headerName, setHeaderName] = useState(routeGroupName || "مجموعة الحصة");
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState(
    routeAvatarUrl || resolvePublicGroupAvatarUrl(groupId, null)
  );

  /** Groupe jamais lu en ligne (hors ligne, sans cache) : message, pas de fil vide. */
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  // Retour du réseau : messages relus (reçus pendant la coupure) et en-tête relu.
  const [reloadKey, setReloadKey] = useState(0);
  const loadHeaderRef = useRef(null);
  const onReconnect = () => {
    setReloadKey((n) => n + 1);
    loadHeaderRef.current?.();
  };
  const markOffline = useOfflineReload(onReconnect, () => setReloadKey((n) => n + 1));

  useEffect(() => {
    if (!authId || !groupId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await cachedGroupMessages(groupId);
        if (cancelled) return;
        markOffline(res);
        if (!res.ok) {
          // Hors ligne sans cache : ni Alert ni retour ; message dans l'écran.
          if (res.offline) {
            setHistoryUnavailable(true);
            return;
          }
          Alert.alert("تعذر فتح المجموعة", res.error || "حاول مرة أخرى");
          navigation.goBack();
          return;
        }
        setHistoryUnavailable(false);
        setMessages(
          (res.messages || []).map((m) => normalizeGroupMessage(m, authId))
        );
        // Marquage « lu » ignoré en silence hors ligne (aucune file d'envoi).
        if (!res.fromCache && !isOffline()) markGroupRead(groupId);
      } catch (e) {
        console.warn("GroupChatScreen: load failed —", e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authId, groupId, navigation, reloadKey, markOffline]);

  useEffect(() => {
    if (!authId || !groupId) return;
    const unsubscribe = subscribeGroupMessages(groupId, async (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [
          ...prev,
          normalizeGroupMessage({ ...msg, sender: msg.sender || null }, authId),
        ];
      });
      // Enrichir le nom d'expéditeur si le payload Realtime n'a pas de join
      if (msg.sender_id && msg.sender_id !== authId && !msg.sender) {
        try {
          const { data } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .eq("id", msg.sender_id)
            .maybeSingle();
          if (data) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id
                  ? {
                      ...m,
                      senderName: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
                    }
                  : m
              )
            );
          }
        } catch {
          /* ignore */
        }
      }
      if (msg.sender_id !== authId) {
        markGroupRead(groupId);
      }
    });
    return unsubscribe;
  }, [authId, groupId]);

  const handleSend = () =>
    runSend(async () => {
      const trimmed = inputText.trim();
      if (!trimmed || !groupId || !authId) return;
      // Hors ligne : toast, le texte reste dans le champ (aucune file d'envoi).
      if (!requireOnline()) return;
      setInputText("");
      const res = await sendGroupMessage({
        groupId,
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
            : [...prev, normalizeGroupMessage(res.message, authId)]
        );
      }
      markGroupRead(groupId);
    });

  const openInfo = () => {
    navigation.navigate("GroupInfo", {
      groupId,
      groupName: headerName,
      groupAvatarUrl: headerAvatarUrl,
    });
  };

  // En-tête (nom, avatar) : cache common.group.<id>.info hors ligne.
  const loadHeader = async () => {
    if (!groupId) return;
    const res = await cachedChatGroup(groupId);
    markOffline(res);
    if (res.ok && res.group) {
      setHeaderName(res.group.name || headerName);
      setHeaderAvatarUrl(res.group.avatarUrl || null);
    }
  };
  loadHeaderRef.current = loadHeader;

  // Refresh header after returning from GroupInfo / focus
  useEffect(() => {
    const unsub = navigation.addListener("focus", async () => {
      if (route.params?.groupName) setHeaderName(route.params.groupName);
      if (route.params?.groupAvatarUrl !== undefined) {
        setHeaderAvatarUrl(route.params.groupAvatarUrl);
      }
      await loadHeaderRef.current?.();
    });
    return unsub;
  }, [navigation, route.params, groupId, headerName]);

  const renderMessage = ({ item }) => {
    const isMine = item.sent;
    return (
      <View
        style={[
          styles.bubbleRow,
          { justifyContent: isMine ? "flex-start" : "flex-end" },
        ]}
      >
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          {!isMine && item.senderName ? (
            <Text style={styles.senderName} numberOfLines={1}>
              {item.senderName}
            </Text>
          ) : null}
          {item.image ? (
            <ChatBubbleImage uri={item.image} style={styles.bubbleImage} />
          ) : null}
          {item.text ? (
            <Text
              style={[
                styles.bubbleText,
                isMine ? styles.bubbleTextMine : styles.bubbleTextOther,
              ]}
            >
              {item.text}
            </Text>
          ) : null}
          <Text
            style={[
              styles.bubbleTime,
              isMine ? styles.bubbleTimeMine : styles.bubbleTimeOther,
            ]}
          >
            {item.time}
          </Text>
        </View>
      </View>
    );
  };

  const avatarLetter = (headerName || "م").trim().charAt(0) || "م";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.headerWrap}>
          <TouchableOpacity
            style={styles.headerTouch}
            onPress={openInfo}
            activeOpacity={0.85}
          >
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
                {headerAvatarUrl ? (
                  <ProfileAvatar
                    userId={groupId}
                    avatarUrl={headerAvatarUrl}
                    cacheKey={headerAvatarUrl || groupId}
                    fallbackLetter={avatarLetter}
                    size={42}
                    softBackgroundColor="rgba(255,255,255,0.28)"
                    letterColor="#fff"
                  />
                ) : (
                  <View style={styles.groupAvatarFallback}>
                    <Ionicons name="people" size={22} color="#fff" />
                  </View>
                )}
              </View>
              <View style={styles.headerText}>
                <Text style={styles.contactName} numberOfLines={1}>
                  {headerName}
                </Text>
                <Text style={styles.headerHint}>اضغط لعرض المعلومات</Text>
              </View>
              <Ionicons name="information-circle-outline" size={22} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {historyUnavailable && messages.length === 0 ? (
          <View style={styles.unavailableWrap}>
            <Text style={styles.unavailableText}>{OFFLINE_UNAVAILABLE_MESSAGE}</Text>
          </View>
        ) : (
          <FlatList
            data={[...messages].reverse()}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={styles.listContent}
          />
        )}

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
          <TouchableOpacity
            style={[styles.sendBtn, sending && styles.sendBtnBusy]}
            onPress={handleSend}
            disabled={sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="send" size={20} color="white" style={styles.sendIcon} />
            )}
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
  headerTouch: { borderRadius: radii.lg, overflow: "hidden" },
  header: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
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
  groupAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.28)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: { flex: 1 },
  contactName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: "#fff",
    ...rtlTextBold,
  },
  headerHint: {
    fontSize: 11,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
    fontFamily: fonts.regular,
    ...rtlText,
  },

  listContent: { paddingVertical: 12 },
  unavailableWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  unavailableText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: "center",
  },
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
  senderName: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.primary,
    marginBottom: 4,
    ...rtlTextBold,
  },
  bubbleImage: {
    width: 180,
    height: 140,
    borderRadius: radii.md,
    marginBottom: 6,
  },
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
  sendBtnBusy: { opacity: 0.7 },
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
