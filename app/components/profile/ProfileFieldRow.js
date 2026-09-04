import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";
import { rtlText, fonts, row as rtlRow } from "../../constants/rtl";

/**
 * Ligne profil RTL : icône ronde au début (droite), label + valeur ensuite.
 * Valeur vide → "—".
 */
export default function ProfileFieldRow({
  icon,
  label,
  value,
  iconColor = colors.primary,
  valueStyle,
  hideIfEmpty = false,
}) {
  const hasValue = value != null && String(value).trim() !== "";
  if (hideIfEmpty && !hasValue) return null;
  const display = hasValue ? String(value) : "—";
  return (
    <View style={styles.itemRow}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, valueStyle]}>{display}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: rtlRow,
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    justifyContent: "center",
    alignItems: "center",
  },
  rowTextWrap: { flex: 1 },
  rowLabel: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  rowValue: {
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.semiBold,
    marginTop: 2,
    ...rtlText,
  },
});
