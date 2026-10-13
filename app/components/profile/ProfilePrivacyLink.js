import React from "react";
import { Linking, StyleSheet, Text, TouchableOpacity } from "react-native";
import { colors, radii, shadows } from "../../constants/theme";
import { fonts, rtlTextBold } from "../../constants/rtl";

export const PRIVACY_POLICY_URL =
  "https://club-altruisme-ensao.vercel.app/privacy.html";

/** Ligne pleine largeur vers la politique de confidentialité. */
export default function ProfilePrivacyLink({ style }) {
  const openPrivacy = () => {
    Linking.openURL(PRIVACY_POLICY_URL).catch(() => {});
  };

  return (
    <TouchableOpacity
      style={[styles.card, shadows.card, style]}
      onPress={openPrivacy}
      activeOpacity={0.75}
      accessibilityRole="link"
      accessibilityLabel="سياسة الخصوصية"
    >
      <Text style={styles.text}>سياسة الخصوصية</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    ...rtlTextBold,
  },
});
