import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import { rtlText, row, textAlignStart, fonts } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { ChatThreadRow } from "../../components/ChatThreadRow";
import { initials } from "./supervisorHelpers";
import { mergeInboxRows, listAdminProfiles } from "../../lib/messagesApi";

function adminDisplayName(admin) {
  const name = `${admin.first_name || ""} ${admin.last_name || ""}`.trim();
  return name || admin.email || "الإدارة";
}

export default function SupervisorMessagesScreen({
  navigation,
  members = [],
  activeGroup = null,
  threads = [],
}) {
  const [admins, setAdmins] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listAdminProfiles();
      if (cancelled || !res.ok) return;
      setAdmins(res.admins || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const adminContacts = useMemo(() => {
    if (admins.length > 0) {
      return admins.map((a) => ({
        id: a.id,
        name: adminDisplayName(a),
        role: "admin",
        avatarLetter: initials(a.first_name || a.email || "إ"),
        avatarPrimary: true,
        highlighted: true,
      }));
    }
    const fromThreads = (threads || []).filter((t) => t.role === "admin");
    if (fromThreads.length > 0) {
      return fromThreads.map((t) => {
        const name =
          `${t.firstName || ""} ${t.lastName || ""}`.trim() || t.email || "الإدارة";
        return {
          id: t.otherId,
          name,
          role: "admin",
          avatarLetter: initials(t.firstName || name),
          avatarPrimary: true,
          highlighted: true,
        };
      });
    }
    return [
      {
        id: "admin",
        name: "الإدارة",
        role: "admin",
        avatarLetter: "إ",
        avatarPrimary: true,
        highlighted: true,
      },
    ];
  }, [admins, threads]);

  const memberContacts = useMemo(
    () =>
      members.map((m) => {
        const name = `${m.user.firstName} ${m.user.lastName}`.trim();
        return {
          id: m.user.id,
          name,
          role: "member",
          avatarLetter: initials(m.user.firstName || name),
        };
      }),
    [members]
  );

  const adminRows = useMemo(
    () => mergeInboxRows(adminContacts, threads, { appendUnknown: false }),
    [adminContacts, threads]
  );

  const memberRows = useMemo(
    () => mergeInboxRows(memberContacts, threads, { appendUnknown: false }),
    [memberContacts, threads]
  );

  const filteredMemberRows = useMemo(() => {
    const q = search.trim();
    if (!q) return memberRows;
    return memberRows.filter((row) => (row.name || "").includes(q));
  }, [memberRows, search]);

  const unreadCount = useMemo(
    () => [...adminRows, ...memberRows].filter((row) => row.unread).length,
    [adminRows, memberRows]
  );

  const openThread = (row) => {
    navigation.navigate("ChatConversation", {
      contactId: row.id,
      contactName: row.name,
      contactAvatarLetter: row.avatarLetter,
      contactRole: row.role,
    });
  };

  return (
    <View style={styles.flexFill}>
      <View style={styles.topBlock}>
        {activeGroup ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryText} numberOfLines={1}>
              {activeGroup.name}
            </Text>
            <Text style={styles.summaryDot}> · </Text>
            <Text style={styles.summaryText}>
              {unreadCount > 0 ? `الرسائل (${unreadCount})` : "الرسائل"}
            </Text>
          </View>
        ) : null}

        <View style={styles.searchWrapper}>
          <Ionicons name="search-outline" size={20} color={colors.placeholder} />
          <TextInput
            placeholder="ابحث عن عضو..."
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            textAlign={textAlignStart}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {adminRows.map((row) => (
        <ChatThreadRow
          key={`admin-${row.id}`}
          name={row.name}
          preview={row.lastMessage}
          time={row.time}
          avatarLetter={row.avatarLetter}
          avatarPrimary
          highlighted={!!row.unread}
          unread={row.unread}
          unreadCount={row.unreadCount}
          onPress={() => openThread(row)}
        />
      ))}

      <View style={styles.messagesDivider}>
        <Text style={styles.messagesDividerText}>أعضاء الحصة</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {filteredMemberRows.length === 0 ? (
          <EmptyState
            text={
              search.trim()
                ? "لا يوجد عضو بهذا الاسم في مجموعاتك"
                : "لا يوجد أعضاء بعد"
            }
          />
        ) : (
          filteredMemberRows.map((row) => (
            <ChatThreadRow
              key={`member-${row.id}`}
              name={row.name}
              preview={row.lastMessage}
              time={row.time}
              avatarLetter={row.avatarLetter}
              highlighted={!!row.unread}
              unread={row.unread}
              unreadCount={row.unreadCount}
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
  topBlock: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  summaryText: {
    fontSize: 16,
    color: "#FFFFFF",
    ...rtlText,
    textAlign: "center",
  },
  summaryDot: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.75)",
    marginHorizontal: 6,
  },
  searchWrapper: {
    flexDirection: row,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    backgroundColor: colors.card,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 14, ...rtlText },
  messagesDivider: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    backgroundColor: colors.bg,
  },
  messagesDividerText: {
    color: colors.gold,
    fontSize: 14,
    fontFamily: fonts.bold,
    ...rtlText,
  },
});
