import React from "react";
import { View, Text, StyleSheet } from "react-native";
import ProfileAvatar from "./ProfileAvatar";
import { colors } from "../constants/theme";
import { rtlText, rtlTextBold, fonts } from "../constants/rtl";

/**
 * En-tête d'alerte : photo de profil de l'expéditeur au centre (comme une notif personnelle).
 */
export default function AlertSenderFace({
  userId = null,
  avatarUrl,
  fallbackLetter = "؟",
  senderName,
  size = 72,
  subtitle,
}) {
  return (
    <View style={styles.wrap}>
      <ProfileAvatar
        userId={userId}
        avatarUrl={avatarUrl}
        cacheKey={avatarUrl || userId}
        fallbackLetter={fallbackLetter}
        size={size}
        softBackgroundColor={colors.primarySoft}
        letterColor={colors.primary}
      />
      <Text style={styles.name}>{senderName || "الإدارة"}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginBottom: 12,
  },
  name: {
    marginTop: 10,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    textAlign: "center",
    ...rtlTextBold,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    ...rtlText,
  },
});
