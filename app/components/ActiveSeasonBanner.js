import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { rtlText } from "../constants/rtl";

const palette = {
  primary: "#2E7D32",
  softGreen: "#E8F5E9",
  border: "#C8E6C9",
  text: "#1B5E20",
  muted: "#558B2F",
};

export default function ActiveSeasonBanner({ season, hint }) {
  if (!season) {
    return (
      <View style={styles.wrap}>
        <Ionicons name="alert-circle-outline" size={18} color={palette.muted} />
        <Text style={styles.empty}>
          لا يوجد موسم نشط — أنشئ موسماً جديداً من لوحة التحكم
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Ionicons name="calendar-outline" size={18} color={palette.primary} />
      <View style={styles.textCol}>
        <Text style={styles.title}>الموسم الحالي: {season.name}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: palette.softGreen,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  textCol: { flex: 1 },
  title: {
    ...rtlText,
    color: palette.text,
    fontWeight: "700",
    fontSize: 14,
  },
  hint: {
    ...rtlText,
    color: palette.muted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  empty: {
    ...rtlText,
    flex: 1,
    color: palette.muted,
    fontSize: 13,
  },
});
