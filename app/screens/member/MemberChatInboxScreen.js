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
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../../constants/theme";
import { rtlTextBold, row as rtlRow, fonts, arrowBack } from "../../constants/rtl";
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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="رجوع"
        >
          <Ionicons name={arrowBack} size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الرسائل</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isEmpty ? (
        <EmptyState
          text={
            supervisor
              ? "لا توجد رسائل بعد"
              : "لا توجد حصة نشطة للتواصل مع المشرف"
          }
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Superviseur épinglé en tête, même ligne que le groupe (surlignage si non lu). */}
          {dmRows.map((row) => (
            <ChatThreadRow
              key={`${row.role}-${row.id}`}
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
          ))}
          {(chatGroups || []).map((group) => (
            <ChatThreadRow
              key={`group-${group.id}`}
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
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.primary,
  },
  headerBtn: {
    padding: 4,
    minWidth: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: "white",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
});
