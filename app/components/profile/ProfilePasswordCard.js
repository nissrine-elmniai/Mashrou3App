import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radii, shadows } from "../../constants/theme";
import ProfileCardHeader from "./ProfileCardHeader";
import ProfileFieldRow from "./ProfileFieldRow";

/**
 * Carte mot de passe — même structure que الحصة + تعديل (fiche superviseur).
 */
export default function ProfilePasswordCard({ onChange }) {
  return (
    <View style={[styles.card, shadows.card]}>
      <ProfileCardHeader
        titleIcon="lock-closed-outline"
        title="تغيير كلمة المرور"
        onAction={onChange}
        accessibilityLabel="تغيير كلمة المرور"
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
