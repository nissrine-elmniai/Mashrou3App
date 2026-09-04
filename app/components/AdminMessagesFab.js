import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatUnreadBadge } from "../lib/messagesApi";
import { fonts } from "../constants/rtl";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  text: "#333333",
};

export default function AdminMessagesFab({
  navigation,
  unreadTotal = 0,
  hidden = false,
  bottomOffset = 16,
}) {
  const insets = useSafeAreaInsets();

  if (hidden) return null;

  const bottom = Math.max(insets.bottom, 16) + bottomOffset;

  return (
    <TouchableOpacity
      style={[styles.fab, { bottom }]}
      onPress={() => navigation.navigate("AdminChat")}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="المحادثات"
    >
      <Ionicons name="chatbubble-ellipses" size={24} color="white" />
      {unreadTotal > 0 ? (
        <View style={styles.fabBadge}>
          <Text style={styles.fabBadgeText}>
            {formatUnreadBadge(unreadTotal)}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    end: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 10,
  },
  fabBadge: {
    position: "absolute",
    top: -2,
    end: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: palette.gold,
    justifyContent: "center",
    alignItems: "center",
  },
  fabBadgeText: {
    color: palette.text,
    fontSize: 10,
    fontFamily: fonts.bold,
  },
});
