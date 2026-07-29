import React, { useMemo, useState } from "react";
import { View, StyleSheet, TextInput, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import { rtlText, row, textAlignStart } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { MemberRow } from "./components/SupervisorWidgets";
import { useSupervisorMembers } from "./hooks/useSupervisorMembers";

export default function SupervisorMembersScreen({ activeGroup, onChangeTab }) {
  const [search, setSearch] = useState("");
  const { membersWithStatus } = useSupervisorMembers(activeGroup);

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
            placeholder="بحث عن عضو..."
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            textAlign={textAlignStart}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {filtered.length === 0 ? (
          <EmptyState text="لا يوجد أعضاء في مجموعاتك" />
        ) : (
          filtered.map((m) => (
            <MemberRow
              key={`${m.group.id}_${m.user.id}`}
              member={m}
              onMessage={() => onChangeTab("messages")}
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
