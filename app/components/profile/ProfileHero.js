import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../constants/theme";
import { rtlTextBold, fonts } from "../../constants/rtl";

/** Initiale unique, même règle que la fiche membre superviseur. */
function initialLetter(name = "") {
  return String(name).trim().charAt(0) || "؟";
}

/**
 * En-tête identité — avatar + nom, identique à la fiche membre côté superviseur.
 */
export default function ProfileHero({ firstName, fullName }) {
  const name = String(fullName || "").trim() || "عضو";
  return (
    <View style={styles.avatarBlock}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initialLetter(firstName)}</Text>
      </View>
      <Text style={styles.name}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBlock: { alignItems: "center", marginBottom: 20 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 26 },
  name: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.text,
    ...rtlTextBold,
  },
});
