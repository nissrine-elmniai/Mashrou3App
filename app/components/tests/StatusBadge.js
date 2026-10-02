import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { fonts, rtlText } from "../../constants/rtl";
import { radii } from "../../constants/theme";

/** #RRGGBB → rgba à l'opacité demandée (fond de pastille à 12 %). */
export function colorWithAlpha(hex, alpha) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length !== 6) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function StatusBadge({ label, color }) {
  return (
    <View style={[styles.badge, { backgroundColor: colorWithAlpha(color, 0.12) }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
});
