import React, { useMemo, useState } from "react";
import { View, StyleSheet, TextInput, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { colors, radii } from "../../constants/theme";
import { rtlText, row, textAlignStart } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { MemberRow } from "./components/SupervisorWidgets";
import { initials } from "./supervisorHelpers";

/** Liste membres — données fournies par SupervisorDashboard (un seul fetch). */
export default function SupervisorMembersScreen({ membersWithStatus = [] }) {
  const navigation = useNavigation();
  const [search, setSearch] = useState("");

  const openChat = (m) => {
    const name = `${m.user.firstName} ${m.user.lastName}`;
    navigation.navigate("ChatConversation", {
      contactId: m.user.id,
      contactName: name,
      contactAvatarLetter: initials(m.user.firstName),
    });
  };

  const openProfile = (m) => {
    navigation.navigate("MemberProfile", {
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      phone: m.user.phone,
      birthDate: m.user.birthDate,
      gender: m.user.gender,
      groupName: m.group?.name,
      groupSchedule: m.group?.schedule,
      registrationStatus: m.registrationStatus,
      registrationDate: m.registrationDate,
    });
  };

  const filtered = useMemo(() => {
    return membersWithStatus.filter((m) => {
      const full = `${m.user.firstName} ${m.user.lastName}`;
      return !search.trim() || full.includes(search.trim());
    });
  }, [membersWithStatus, search]);

  return (
    <View style={styles.flexFill}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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

        {filtered.length === 0 ? (
          <EmptyState text="لا يوجد عضو بهذا الاسم في مجموعاتك" />
        ) : (
          filtered.map((m) => (
            <MemberRow
              key={`${m.group.id}_${m.user.id}`}
              member={m}
              onMessage={() => openChat(m)}
              onOpenProfile={() => openProfile(m)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  searchWrapper: {
    flexDirection: row,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    marginBottom: 14,
    backgroundColor: colors.card,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, ...rtlText },
});
