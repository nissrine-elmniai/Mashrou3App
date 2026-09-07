import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";
import { rtlTextBold, fonts, row as rtlRow } from "../../constants/rtl";

/**
 * En-tête de carte profil — titre (+ icône optionnelle) et bouton d'action vert.
 */
export default function ProfileCardHeader({
  title,
  titleIcon,
  actionIcon = "create-outline",
  onAction,
  accessibilityLabel,
}) {
  return (
    <View style={styles.header}>
      {titleIcon ? (
        <View style={styles.titleIconWrap}>
          <Ionicons name={titleIcon} size={18} color={colors.primary} />
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {onAction ? (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <Ionicons name={actionIcon} size={20} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: rtlRow,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  titleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    ...rtlTextBold,
  },
  iconBtn: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
