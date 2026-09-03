import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Menu, Bell } from "lucide-react-native";
import { colors } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { ChatThreadRow } from "../../components/ChatThreadRow";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { getSupervisorProfiles } from "../../lib/seancesApi";
import { mergeInboxRows } from "../../lib/messagesApi";
import { initials } from "../supervisor/supervisorHelpers";

export default function AdminChatScreen({ navigation }) {
  const { currentUser, stats } = useApp();
  const { openSidebar, sidebar, messagesFab, threads, threadsLoading } = useAdminSidebar(
    navigation,
    "chat"
  );
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(true);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setContactsLoading(true);
      const sRes = await getSupervisorProfiles();
      if (cancelled) return;
      const list = [];
      if (sRes.ok) {
        for (const p of sRes.supervisors || []) {
          const name = `${p.first_name || ""} ${p.last_name || ""}`.trim();
          list.push({
            id: p.id,
            name: name || p.email,
            role: "supervisor",
            avatarLetter: initials(p.first_name || name || p.email),
          });
        }
      }
      setContacts(list);
      setContactsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const merged = mergeInboxRows(contacts, threads);
    return merged.filter((r) => r.role !== "member");
  }, [contacts, threads]);

  const loading = contactsLoading || threadsLoading;

  const openThread = (row) => {
    navigation.navigate("ChatConversation", {
      contactId: row.id,
      contactName: row.name,
      contactAvatarLetter: row.avatarLetter,
      contactRole: row.role || "supervisor",
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
        <Text style={styles.topBarTitle}>الدردشة</Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminNotifications")}
          hitSlop={12}
        >
          <Bell size={24} color={colors.muted} pointerEvents="none" />
          {pendingCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {pendingCount > 9 ? "9+" : pendingCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <View style={styles.messagesDivider}>
        <Text style={styles.messagesDividerText}>المحادثات</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
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
              avatarLetter={row.avatarLetter}
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
  topBarAvatar: {
    width: 32,
    height: 32,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarAvatarText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    backgroundColor: "#D32F2F",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  messagesDivider: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.bg,
  },
  messagesDividerText: { color: colors.muted, fontSize: 13, ...rtlText },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
});
