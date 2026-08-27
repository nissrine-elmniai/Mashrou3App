import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors } from "../../constants/theme";
import { rtlText, row } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { ChatThreadRow } from "../../components/ChatThreadRow";
import { useSupervisorMembers } from "./hooks/useSupervisorMembers";
import { initials } from "./supervisorHelpers";
import { mergeInboxRows } from "../../lib/messagesApi";
import { useInboxThreads } from "../../hooks/useInboxThreads";

export default function SupervisorMessagesScreen({ navigation }) {
  const { members } = useSupervisorMembers();
  const { threads } = useInboxThreads();
  const [seenAt, setSeenAt] = useState({});

  const adminThread = threads.find((t) => t.role === "admin");
  const adminContact = {
    id: adminThread?.otherId || "admin",
    name: "الإدارة",
    role: "admin",
    avatarLetter: "إ",
    avatarPrimary: true,
    highlighted: true,
  };

  const memberContacts = members.map((m) => {
    const name = `${m.user.firstName} ${m.user.lastName}`.trim();
    return {
      id: m.user.id,
      name,
      role: "member",
      avatarLetter: initials(m.user.firstName || name),
    };
  });

  const memberRows = useMemo(
    () => mergeInboxRows(memberContacts, threads, seenAt),
    [memberContacts, threads, seenAt]
  );

  const [adminRow] = mergeInboxRows([adminContact], threads, seenAt);

  const openThread = (row) => {
    setSeenAt((prev) => ({ ...prev, [row.id]: Date.now() }));
    navigation.navigate("ChatConversation", {
      contactId: row.role === "admin" ? "admin" : row.id,
      contactName: row.name,
      contactAvatarLetter: row.avatarLetter,
    });
  };

  return (
    <View style={styles.flexFill}>
      <ChatThreadRow
        name={adminRow?.name || "الإدارة"}
        preview={adminRow?.lastMessage || "لا توجد رسائل بعد"}
        time={adminRow?.time}
        avatarLetter="إ"
        avatarPrimary
        highlighted
        unread={adminRow?.unread}
        onPress={() => openThread(adminRow || adminContact)}
      />

      <View style={styles.messagesDivider}>
        <Text style={styles.messagesDividerText}>أعضاء الحصة</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {memberRows.length === 0 ? (
          <EmptyState text="لا يوجد أعضاء بعد" />
        ) : (
          memberRows.map((row) => (
            <ChatThreadRow
              key={row.id}
              name={row.name}
              preview={row.lastMessage}
              time={row.time}
              avatarLetter={row.avatarLetter}
              unread={row.unread}
              onPress={() => openThread(row)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  messagesDivider: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.bg,
  },
  messagesDividerText: { color: colors.muted, fontSize: 13, ...rtlText },
});
