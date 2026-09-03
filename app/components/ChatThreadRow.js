import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "../constants/theme";
import { rtlText, rtlTextBold, row, fonts } from "../constants/rtl";

export function ChatThreadRow({
  name,
  preview,
  time,
  avatarLetter,
  avatarPrimary,
  unread,
  highlighted,
  hideBorder = false,
  onPress,
}) {
  return (
    <TouchableOpacity
      style={[
        styles.rowItem,
        highlighted && styles.rowHighlight,
        hideBorder && styles.rowNoBorder,
      ]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={styles.avatarWrap}>
        <View
          style={[
            styles.avatar,
            avatarPrimary && { backgroundColor: colors.primary },
          ]}
        >
          <Text style={avatarPrimary ? styles.avatarTextWhite : styles.avatarText}>
            {avatarLetter}
          </Text>
        </View>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <View style={styles.meta}>
        {time ? <Text style={styles.time}>{time}</Text> : null}
        {unread ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>1</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  rowItem: {
    flexDirection: row,
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  rowHighlight: { backgroundColor: colors.primarySoft },
  rowNoBorder: { borderBottomWidth: 0 },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 15 },
  avatarTextWhite: { color: "white", fontFamily: fonts.bold, fontSize: 15 },
  info: { flex: 1 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, ...rtlTextBold },
  preview: { color: colors.muted, fontSize: 13, marginTop: 3, ...rtlText },
  meta: { alignItems: "center", gap: 4 },
  time: { color: colors.placeholder, fontSize: 11 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.gold,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: { color: colors.text, fontSize: 11, fontFamily: fonts.bold },
});
