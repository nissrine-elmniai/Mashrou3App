import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import ProfileAvatar from "../ProfileAvatar";

const palette = {
  primary: "#2E7D32",
  softGreen: "#E8F5E9",
};

export default function AdminTopBarAvatar({ currentUser, onPress, style, ...touchableProps }) {
  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const letter = displayName.charAt(0) || "م";

  return (
    <TouchableOpacity
      style={[styles.wrap, style]}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="الملف الشخصي"
      {...touchableProps}
    >
      <ProfileAvatar
        avatarUrl={currentUser?.avatarUrl}
        fallbackLetter={letter}
        size={32}
        softBackgroundColor={palette.softGreen}
        letterColor={palette.primary}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 32,
    height: 32,
  },
});
