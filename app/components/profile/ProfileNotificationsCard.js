import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radii, shadows } from "../../constants/theme";
import ProfileCardHeader from "./ProfileCardHeader";

/** Raccourci profil → إعدادات الإشعارات (catégories + appareil). */
export default function ProfileNotificationsCard({ onPress }) {
  return (
    <View style={[styles.card, shadows.card]}>
      <ProfileCardHeader
        titleIcon="notifications-outline"
        title="إعدادات الإشعارات"
        actionIcon="chevron-back"
        onAction={onPress}
        accessibilityLabel="إعدادات الإشعارات"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
  },
});
