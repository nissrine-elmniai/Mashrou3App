import React, { useEffect, useMemo, useState } from "react";
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
import { colors } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts, arrowBack } from "../../constants/rtl";
import { ChatThreadRow } from "../../components/ChatThreadRow";
import { EmptyState } from "../../components/ui";
import { getMySeance, mergeInboxRows } from "../../lib/messagesApi";
import { useInboxThreads } from "../../hooks/useInboxThreads";
import { initials } from "../supervisor/supervisorHelpers";

export default function MemberChatInboxScreen({ navigation }) {
  const { threads, loading: threadsLoading } = useInboxThreads();
  const [supervisor, setSupervisor] = useState(null);
  const [seanceLoading, setSeanceLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getMySeance();
      if (cancelled) return;
      if (res.ok && res.seance?.superviseur_id) {
        const s = res.seance.superviseur || {};
        const name = `${s.first_name || ""} ${s.last_name || ""}`.trim();
        setSupervisor({
          id: res.seance.superviseur_id,
          name: name || "المشرف",
          role: "supervisor",
          avatarLetter: initials(s.first_name || name || "م"),
        });
      }
      setSeanceLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const contacts = useMemo(
    () => (supervisor ? [supervisor] : []),
    [supervisor]
  );

  const rows = useMemo(() => {
    const merged = mergeInboxRows(contacts, threads, {
      appendUnknown: false,
    });
    return merged.filter((r) => r.role !== "admin");
  }, [contacts, threads]);

  const openThread = (row) => {
    navigation.navigate("ChatConversation", {
      contactId: row.id,
      contactName: row.name,
      contactAvatarLetter: row.avatarLetter,
      contactRole: row.role || "supervisor",
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
        <EmptyState text="لا توجد حصة نشطة للتواصل مع المشرف" />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {rows.map((row) => (
            <ChatThreadRow
              key={`${row.role}-${row.id}`}
              name={row.name}
              preview={row.lastMessage}
              time={row.time}
              avatarLetter={row.avatarLetter}
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
