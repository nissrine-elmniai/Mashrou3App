import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Menu, Bell } from "lucide-react-native";
import { colors } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { ChatThreadRow } from "../../components/ChatThreadRow";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { getAdminChatSupervisors } from "../../lib/seancesApi";
import { getActiveRegularSeason } from "../../lib/seasonScope";
import {
  adminInboxContactRole,
  filterAdminInboxRows,
  mergeInboxRows,
} from "../../lib/messagesApi";
import { initials } from "../supervisor/supervisorHelpers";
import { displayProfileEmail } from "../../lib/authEmail";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";
import InboxHeaderButton from "../../components/InboxHeaderButton";

export default function AdminChatScreen({ navigation }) {
  const { currentUser, seasons } = useApp();
  const activeSeasonId = getActiveRegularSeason(seasons)?.id || null;
  const {
    openSidebar,
    sidebar,
    messagesFab,
    threads,
    threadsLoading,
    threadsError,
    reloadThreads,
  } = useAdminSidebar(navigation, "chat");
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const requestRef = useRef(0);

  const loadContacts = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!activeSeasonId) {
      setContacts([]);
      setContactsError(null);
      setContactsLoading(false);
      return;
    }
    setContactsLoading(true);
    const sRes = await getAdminChatSupervisors({ saisonId: activeSeasonId });
    if (requestId !== requestRef.current) return;
    if (!sRes.ok) {
      setContactsError(sRes.error || "تعذر تحميل المحادثات");
      setContactsLoading(false);
      return;
    }
    const list = [];
    for (const p of sRes.supervisors || []) {
      const name = `${p.first_name || ""} ${p.last_name || ""}`.trim();
      const shownEmail = displayProfileEmail(p);
      list.push({
        id: p.id,
        name: name || shownEmail,
        role: p.role || "supervisor",
        roles: Array.isArray(p.roles) ? p.roles : [],
        account_status: p.account_status || null,
        avatarLetter: initials(p.first_name || name || shownEmail),
        avatarUrl: p.avatar_url || null,
      });
    }
    setContacts(list);
    setContactsError(null);
    setContactsLoading(false);
  }, [activeSeasonId]);

  // Recharge à chaque focus et quand la saison active change.
  // Pas de useEffect en plus : le premier montage ne lance qu'un appel.
  useFocusEffect(
    useCallback(() => {
      loadContacts();
      return () => {
        requestRef.current += 1;
      };
    }, [loadContacts])
  );

  const retry = async () => {
    setRetrying(true);
    try {
      await Promise.all([loadContacts(), reloadThreads()]);
    } finally {
      setRetrying(false);
    }
  };

  const rows = useMemo(
    () => filterAdminInboxRows(mergeInboxRows(contacts, threads)),
    [contacts, threads]
  );

  const loading = retrying || contactsLoading || threadsLoading;
  const failed = !loading && (contactsError || threadsError);

  const openThread = (row) => {
    navigation.navigate("ChatConversation", {
      contactId: row.id,
      contactName: row.name,
      contactAvatarLetter: row.avatarLetter,
      contactAvatarUrl: row.avatarUrl || null,
      contactRole: adminInboxContactRole(row),
    });
  };

  return (
    <SafeAreaView style={styles.flexFill} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={openSidebar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
        >
          <Menu size={24} color={colors.text} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>المحادثات</Text>
        <AdminTopBarAvatar
          currentUser={currentUser}
          onPress={() => navigation.navigate("AdminProfile")}
        />
        <InboxHeaderButton
          navigation={navigation}
          color={colors.muted}
          variant="lucide"
          size={24}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
          hitSlop={12}
        >
          <Bell size={24} color={colors.muted} pointerEvents="none" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : failed ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>تعذر تحميل المحادثات</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="إعادة المحاولة"
          >
            <Text style={styles.retryText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <EmptyState text="لا يوجد مشرفون بعد" />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {rows.map((row) => (
            <ChatThreadRow
              key={row.id}
              name={row.name}
              preview={row.lastMessage}
              time={row.time}
              userId={row.id}
              avatarLetter={row.avatarLetter}
              avatarUrl={row.avatarUrl}
              unread={row.unread}
              unreadCount={row.unreadCount}
              onPress={() => openThread(row)}
            />
          ))}
        </ScrollView>
      )}
      {messagesFab}
      {sidebar}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    backgroundColor: colors.card,
    padding: 16,
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topBarTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    color: colors.text,
    fontSize: 16,
    ...rtlTextBold,
  },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 24,
  },
  errorText: {
    color: "#D32F2F",
    textAlign: "center",
    fontFamily: fonts.regular,
    ...rtlText,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: "#fff",
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});
