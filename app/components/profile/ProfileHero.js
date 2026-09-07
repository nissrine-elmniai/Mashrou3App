import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../constants/theme";
import { rtlTextBold, fonts } from "../../constants/rtl";
import ProfileAvatar from "../ProfileAvatar";
import EditableAvatar from "../EditableAvatar";

/** Initiale unique, même règle que la fiche membre superviseur. */
function initialLetter(name = "") {
  return String(name).trim().charAt(0) || "؟";
}

/**
 * En-tête identité — avatar + nom, identique à la fiche membre côté superviseur.
 * Si `editable`, l'avatar peut être changé (photo de profil).
 */
export default function ProfileHero({
  firstName,
  fullName,
  avatarUrl,
  editable = false,
  authId,
  onAvatarChanged,
}) {
  const name = String(fullName || "").trim() || "عضو";
  const letter = initialLetter(firstName || name);
  return (
    <View style={styles.avatarBlock}>
      {editable ? (
        <EditableAvatar
          authId={authId}
          avatarUrl={avatarUrl}
          fallbackLetter={letter}
          size={76}
          onChanged={onAvatarChanged}
        />
      ) : (
        <ProfileAvatar
          avatarUrl={avatarUrl}
          fallbackLetter={letter}
          size={76}
          softBackgroundColor={colors.primarySoft}
          letterColor={colors.primary}
        />
      )}
      <Text style={styles.name}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBlock: { alignItems: "center", marginBottom: 20 },
  name: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    marginTop: 10,
    ...rtlTextBold,
  },
});
