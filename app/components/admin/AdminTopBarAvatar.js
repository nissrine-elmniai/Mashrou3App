import React from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import ProfileAvatar from "../ProfileAvatar";

const palette = {
  primary: "#2E7D32",
  softGreen: "#E8F5E9",
};

/**
 * Avatar barre admin. Sans `onPress` : affichage seul (ex. déjà sur le profil).
 */
export default function AdminTopBarAvatar({
  currentUser,
  onPress,
  style,
  ...touchableProps
}) {
  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const letter = displayName.charAt(0) || "م";

  const avatar = (
    <ProfileAvatar
      userId={currentUser?.authId || currentUser?.id || null}
      avatarUrl={currentUser?.avatarUrl}
      fallbackLetter={letter}
      size={32}
      softBackgroundColor={palette.softGreen}
      letterColor={palette.primary}
    />
  );

  if (!onPress) {
    return <View style={[styles.wrap, style]}>{avatar}</View>;
  }

  return (
    <TouchableOpacity
      style={[styles.wrap, style]}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="الملف الشخصي"
      {...touchableProps}
    >
      {avatar}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 32,
    height: 32,
  },
});
