import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { colors } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { getSupervisorProfiles } from "../../lib/seancesApi";
import { initials } from "../supervisor/supervisorHelpers";

export default function AdminChatScreen({ navigation }) {
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await getSupervisorProfiles();
      if (cancelled) return;
      if (res.ok) setSupervisors(res.supervisors);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.flexFill}>
      <View style={styles.messagesDivider}>
        <Text style={styles.messagesDividerText}>قائمة المشرفين</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : supervisors.length === 0 ? (
        <EmptyState text="لا يوجد مشرفون بعد — أضفهم من شاشة المشرفين" />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {supervisors.map((s) => {
            const name = `${s.first_name || ""} ${s.last_name || ""}`.trim();
            return (
              <TouchableOpacity
                key={s.id}
                style={styles.messageRow}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate("ChatConversation", {
                    contactId: s.id,
                    contactName: name || s.email,
                    contactAvatarLetter: initials(s.first_name || name),
                  })
                }
              >
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {initials(s.first_name || name)}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {name || s.email}
                  </Text>
                  <Text style={styles.lastMessage} numberOfLines={1}>
                    {s.email}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 15 },
  memberInfo: { flex: 1 },
  memberName: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, ...rtlTextBold },
  messagesDivider: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.bg },
  messagesDividerText: { color: colors.muted, fontSize: 13, ...rtlText },
  messageRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  lastMessage: { color: colors.muted, fontSize: 13, marginTop: 3, ...rtlText },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
});