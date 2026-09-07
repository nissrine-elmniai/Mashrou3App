import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../../constants/theme";
import { rtlTextBold, row, fonts, arrowBack } from "../../constants/rtl";
import { ChatThreadRow } from "../../components/ChatThreadRow";
import { EmptyState } from "../../components/ui";
import { getMySeance, mergeInboxRows } from "../../lib/messagesApi";
import { resolvePublicAvatarUrl } from "../../lib/avatarApi";
import { useInboxThreads } from "../../hooks/useInboxThreads";
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
    highlighted: true,
  };
}

export default function MemberChatInboxScreen({ navigation }) {
  const { threads, loading: threadsLoading } = useInboxThreads();
  const [supervisor, setSupervisor] = useState(null);
  const [seanceLoading, setSeanceLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setSeanceLoading(true);
        const res = await getMySeance();
        if (cancelled) return;
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

  const rows = useMemo(() => {
    // appendUnknown: le badge du FAB compte TOUS les non-lus ; la boîte doit
    // afficher les mêmes fils (ex. superviseur d'une saison précédente), sinon
    // le membre voit "3" sans aucune conversation.
    const merged = mergeInboxRows(contacts, threads, {
      appendUnknown: true,
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.card} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name={arrowBack} size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>الرسائل</Text>
      </View>

      {threadsLoading || seanceLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          text={
            supervisor
              ? "لا توجد رسائل بعد"
              : "لا توجد حصة نشطة للتواصل مع المشرف"
          }
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {rows.map((row) => (
            <ChatThreadRow
              key={`${row.role}-${row.id}`}
              name={row.name}
              preview={row.lastMessage}
              time={row.time}
              userId={row.id}
              avatarLetter={row.avatarLetter}
              avatarUrl={row.avatarUrl}
              avatarPrimary={row.avatarPrimary}
              highlighted={row.highlighted}
              unread={row.unread}
              unreadCount={row.unreadCount}
              onPress={() => openThread(row)}
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
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 2 },
  title: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    ...rtlTextBold,
  },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
});
