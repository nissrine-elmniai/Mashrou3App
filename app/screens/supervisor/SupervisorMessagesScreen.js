import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { colors } from "../../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../../constants/rtl";
import { EmptyState } from "../../components/ui";
import { useSupervisorMembers } from "./hooks/useSupervisorMembers";
import { initials } from "./supervisorHelpers";

export default function SupervisorMessagesScreen({ navigation }) {
  const { members } = useSupervisorMembers();

  return (
    <View style={styles.flexFill}>
      <TouchableOpacity
        style={styles.adminChat}
        activeOpacity={0.7}
        onPress={() =>
          navigation.navigate("ChatConversation", {
            contactId: "admin",
            contactName: "الإدارة",
            contactAvatarLetter: "إ",
          })
        }
      >
        <View style={styles.avatarWrap}>
          <View style={[styles.memberAvatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.memberAvatarTextWhite}>إ</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>الإدارة</Text>
          <Text style={styles.lastMessage} numberOfLines={1}>
            تم تحديث جدول الجلسات
          </Text>
        </View>
        <View style={styles.msgMetaCol}>
          <Text style={styles.msgTime}>منذ 5 دقائق</Text>
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>2</Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.messagesDivider}>
        <Text style={styles.messagesDividerText}>أعضاء الجلسة</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {members.length === 0 ? (
          <EmptyState text="لا يوجد أعضاء بعد" />
        ) : (
          members.map((m, i) => {
            const name = `${m.user.firstName} ${m.user.lastName}`;
            const times = ["منذ ساعة", "أمس", "أمس", "منذ يومين"];
            const unread = [0, 1, 0, 0];
            return (
              <TouchableOpacity
                key={m.user.id}
                style={styles.messageRow}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate("ChatConversation", {
                    contactId: m.user.id,
                    contactName: name,
                    contactAvatarLetter: initials(m.user.firstName),
                  })
                }
              >
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{initials(m.user.firstName)}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{name}</Text>
                  <Text style={styles.lastMessage} numberOfLines={1}>
                    لا توجد رسائل بعد
                  </Text>
                </View>
                <View style={styles.msgMetaCol}>
                  <Text style={styles.msgTime}>{times[i % times.length]}</Text>
                  {unread[i % unread.length] > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{unread[i % unread.length]}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flexFill: { flex: 1 },
  adminChat: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: colors.primarySoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarWrap: { position: "relative" },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 15 },
  memberAvatarTextWhite: { color: "white", fontFamily: fonts.bold, fontSize: 15 },
  statusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.card,
  },
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
  msgMetaCol: { alignItems: "center", gap: 4 },
  msgTime: { color: colors.placeholder, fontSize: 11 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.gold,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadBadgeText: { color: colors.text, fontSize: 11, fontFamily: fonts.bold },
});
