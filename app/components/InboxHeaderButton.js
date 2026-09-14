import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Inbox } from "lucide-react-native";
import { colors } from "../constants/theme";
import { fonts } from "../constants/rtl";
import { formatUnreadBadge } from "../lib/messagesApi";
import { useUnreadNotifications } from "../hooks/useUnreadNotifications";

/**
 * Bouton inbox → UnifiedInboxScreen (même destination que la cloche
 * membre/superviseur). Badge = notifications non lues uniquement (hors alertes).
 */
export default function InboxHeaderButton({
  navigation,
  color = "#fff",
  variant = "ionicon",
  size = 22,
}) {
  const { count } = useUnreadNotifications();
  const label =
    count > 0 ? `الإشعارات، ${count} غير مقروءة` : "الإشعارات";

  return (
    <TouchableOpacity
      style={styles.wrap}
      onPress={() => navigation.navigate("NotificationInbox")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {variant === "lucide" ? (
        <Inbox size={size} color={color} pointerEvents="none" />
      ) : (
        <Ionicons name="mail-outline" size={size} color={color} />
      )}
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatUnreadBadge(count)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", padding: 2 },
  badge: {
    position: "absolute",
    top: -4,
    left: -6,
    backgroundColor: colors.red,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: fonts.bold,
  },
});
