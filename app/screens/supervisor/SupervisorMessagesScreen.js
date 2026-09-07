import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import { rtlText, rtlTextBold, row, textAlignStart, fonts, arrowBack } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { ChatThreadRow } from "../../components/ChatThreadRow";
import { initials } from "./supervisorHelpers";
import { mergeInboxRows, listAdminProfiles } from "../../lib/messagesApi";
import { resolvePublicAvatarUrl } from "../../lib/avatarApi";
import { useInboxThreads } from "../../hooks/useInboxThreads";
import { useApp } from "../../context/AppContext";
import { getSupervisorActiveSeance, getSeanceMembers } from "../../lib/membersApi";
import { isSupabaseEntityId } from "./supervisorAttendanceHelpers";

function adminDisplayName(admin) {
  const name = `${admin.first_name || ""} ${admin.last_name || ""}`.trim();
  return name || admin.email || "الإدارة";
}

export default function SupervisorMessagesScreen({ navigation, route }) {
  const { currentUser, supabaseSession } = useApp();
  const authId = supabaseSession?.user?.id || currentUser?.authId || null;
  const seanceId = route?.params?.seanceId || null;
  const paramMembers = route?.params?.members;
  const paramGroupName = route?.params?.groupName || null;
  const { threads } = useInboxThreads();
  const [admins, setAdmins] = useState([]);
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState(() =>
    (paramMembers || []).map((m) => ({
      user: {
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        avatarUrl: m.avatarUrl || null,
      },
    }))
  );
  const [activeGroup, setActiveGroup] = useState(
    paramGroupName ? { id: seanceId, name: paramGroupName } : null
  );
  const [loading, setLoading] = useState(!paramMembers);

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

  useFocusEffect(
    useCallback(() => {
      if (!isSupabaseEntityId(authId)) {
        setLoading(false);
        return undefined;
      }
      let cancelled = false;
      (async () => {
        if (!paramMembers) setLoading(true);
        const seanceRes = await getSupervisorActiveSeance(
          authId,
          isSupabaseEntityId(seanceId) ? seanceId : null
        );
        if (cancelled) return;
        const seance = seanceRes.ok ? seanceRes.seance : null;
        if (!seance) {
          if (!paramMembers) {
            setActiveGroup(null);
            setMembers([]);
          }
          setLoading(false);
          return;
        }
        setActiveGroup({ id: seance.id, name: seance.nom });
        const membersRes = await getSeanceMembers(seance.id);
        if (cancelled) return;
        if (membersRes.ok) {
          setMembers(
            (membersRes.members || []).map((m) => ({
              user: {
                id: m.userId,
                firstName: m.prenom,
                lastName: m.nom,
                avatarUrl: m.avatarUrl || null,
              },
            }))
          );
        }
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [authId, seanceId, paramMembers])
  );

  const adminContacts = useMemo(() => {
    if (admins.length > 0) {
      return admins.map((a) => ({
        id: a.id,
        name: adminDisplayName(a),
        role: "admin",
        avatarLetter: initials(a.first_name || a.email || "إ"),
        avatarUrl: resolvePublicAvatarUrl(a.id, a.avatar_url),
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
          avatarUrl: t.avatarUrl || resolvePublicAvatarUrl(t.otherId, null),
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
          avatarUrl: m.user.avatarUrl || resolvePublicAvatarUrl(m.user.id, null),
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

  const openThread = (row) => {
    navigation.navigate("ChatConversation", {
      contactId: row.id,
      contactName: row.name,
      contactAvatarLetter: row.avatarLetter,
      contactAvatarUrl: row.avatarUrl || null,
      contactRole: row.role,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name={arrowBack} size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الرسائل</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={styles.flexFill}>
          <View style={styles.topBlock}>
            {activeGroup ? (
              <Text style={styles.groupName} numberOfLines={1}>
                {activeGroup.name}
              </Text>
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
                  userId={row.id}
                  avatarLetter={row.avatarLetter}
                  avatarUrl={row.avatarUrl}
                  highlighted={!!row.unread}
                  unread={row.unread}
                  unreadCount={row.unreadCount}
                  onPress={() => openThread(row)}
                />
              ))
            )}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flexFill: { flex: 1 },
  header: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.primary,
  },
  backBtn: { padding: 2 },
  headerTitle: {
    flex: 1,
    color: "white",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBlock: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  groupName: {
    fontSize: 14,
    color: colors.muted,
    fontFamily: fonts.medium,
    marginBottom: 12,
    ...rtlText,
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
