import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { colors, radii, shadows } from "../../constants/theme";
import {
  rtlText,
  row,
  fonts,
  arrowBack,
  isRTL,
} from "../../constants/rtl";
import { ChatThreadRow } from "../../components/ChatThreadRow";
import { EmptyState } from "../../components/ui";
import { getMyCurrentInscription, mergeInboxRows } from "../../lib/messagesApi";
import { resolvePublicAvatarUrl } from "../../lib/avatarApi";
import { useInboxThreads } from "../../hooks/useInboxThreads";
import { useChatGroups } from "../../hooks/useChatGroups";
import { initials } from "../supervisor/supervisorHelpers";

function supervisorContactFromSeance(seance) {
  if (!seance?.superviseur_id) return null;
  const s = seance.superviseur || {};
  const name = `${s.first_name || ""} ${s.last_name || ""}`.trim();
  const email = String(s.email || "").trim();
  // Pas de ligne fantôme « المشرف » si le profil n'est pas lisible (RLS / jointure).
  if (!name && !email) return null;
  const displayName = name || email;
  return {
    id: seance.superviseur_id,
    name: displayName,
    role: "supervisor",
    avatarLetter: initials(s.first_name || displayName || "م"),
    avatarUrl: resolvePublicAvatarUrl(seance.superviseur_id, s.avatar_url),
    seanceId: seance.id,
  };
}

const alignEdge = isRTL ? "flex-start" : "flex-end";

export default function MemberChatInboxScreen({ navigation }) {
  const { threads, loading: threadsLoading } = useInboxThreads();
  const { groups: chatGroups, loading: groupsLoading } = useChatGroups();
  const [supervisor, setSupervisor] = useState(null);
  const [seanceLoading, setSeanceLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setSeanceLoading(true);
        const res = await getMyCurrentInscription();
        if (cancelled) return;
        // Sans inscription du musim actif : pas de ligne superviseur.
        // L'historique DM n'est plus fusionné (appendUnknown: false).
        setSupervisor(
          res.ok ? supervisorContactFromSeance(res.seance) : null
        );
        setSeanceLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const contacts = useMemo(
    () => (supervisor ? [supervisor] : []),
    [supervisor]
  );

  const dmRows = useMemo(() => {
    // Affiliation seulement (comme l'inbox superviseur) : un ancien
    // superviseur avec qui des DM existent encore n'apparaît plus.
    // Le badge FAB ne compte que ces mêmes correspondants.
    const merged = mergeInboxRows(contacts, threads, {
      appendUnknown: false,
    });
    return merged.filter((r) => {
      if (r.role === "admin") return false;
      // Contact fantôme « المشرف » (profil non joint) — pas un utilisateur.
      if (r.name === "المشرف") return false;
      // Ligne sans identité et sans historique
      if (!r.lastAt && (r.name === "—" || !String(r.name || "").trim())) {
        return false;
      }
      return true;
    });
  }, [contacts, threads]);

  const openGroupChat = (group) => {
    navigation.navigate("GroupChat", {
      groupId: group.id,
      groupName: group.name,
      groupAvatarUrl: group.avatarUrl || null,
    });
  };

  const openThread = (row) => {
    navigation.navigate("ChatConversation", {
      contactId: row.id,
      contactName: row.name,
      contactAvatarLetter: row.avatarLetter,
      contactAvatarUrl: row.avatarUrl || null,
      contactRole: row.role || "supervisor",
      seanceId: row.seanceId || supervisor?.seanceId || null,
    });
  };

  const loading = threadsLoading || seanceLoading || groupsLoading;
  const isEmpty =
    !loading && (chatGroups || []).length === 0 && dmRows.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar style="dark" />

      <View style={styles.headerWrap}>
        <LinearGradient colors={colors.gradientHeader} style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.goBack()}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="رجوع"
            >
              <Ionicons name={arrowBack} size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>الرسائل</Text>
              <Text style={styles.headerSubtitle}>
                تواصل مع مشرف حصتك ومجموعة الجلسة
              </Text>
            </View>
            <Ionicons name="chatbubbles-outline" size={22} color="#fff" />
          </View>
        </LinearGradient>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isEmpty ? (
        <View style={[styles.emptyCard, shadows.card]}>
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={36}
            color={colors.primary}
          />
          <EmptyState
            text={
              supervisor
                ? "لا توجد رسائل بعد"
                : "لا توجد حصة نشطة للتواصل مع المشرف"
            }
          />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* Superviseur épinglé en tête, même ligne que le groupe (surlignage si non lu). */}
          {dmRows.map((row) => (
            <View key={`${row.role}-${row.id}`} style={[styles.threadCard, shadows.card]}>
              <ChatThreadRow
                name={row.name}
                preview={row.lastMessage}
                time={row.time}
                userId={row.id}
                avatarLetter={row.avatarLetter}
                avatarUrl={row.avatarUrl}
                avatarPrimary={!row.avatarUrl}
                highlighted={!!row.unread}
                unread={row.unread}
                unreadCount={row.unreadCount}
                onPress={() => openThread(row)}
              />
            </View>
          ))}
          {(chatGroups || []).map((group) => (
            <View key={`group-${group.id}`} style={[styles.threadCard, shadows.card]}>
              <ChatThreadRow
                name={group.name}
                preview={group.lastMessage}
                time={group.time}
                userId={group.id}
                avatarLetter={(group.name || "م").charAt(0)}
                avatarUrl={group.avatarUrl}
                avatarPrimary={!group.avatarUrl}
                isGroup
                highlighted={!!group.unread}
                unread={group.unread}
                unreadCount={group.unreadCount}
                onPress={() => openGroupChat(group)}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  header: {
    borderRadius: radii.lg,
    overflow: "hidden",
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    alignItems: alignEdge,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlText,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    marginTop: 4,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  threadCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    overflow: "hidden",
  },
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    padding: 28,
    alignItems: "center",
  },
});
