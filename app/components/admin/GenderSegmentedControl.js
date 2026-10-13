import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../../constants/theme";
import { isRTL, row, fonts } from "../../constants/rtl";
import { GENDER_FILTERS } from "../../lib/genderFilter";

/**
 * Sélecteur segmenté « الجميع / ذكور / إناث » (annuaire et demandes admin).
 * Largeur adaptée au contenu, aligné en début de ligne (droite en RTL).
 */
export default function GenderSegmentedControl({ value, onChange, style }) {
  return (
    <View style={[styles.control, style]} accessibilityRole="tablist">
      {GENDER_FILTERS.map(([key, label], index) => {
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.segment,
              index > 0 && styles.segmentDivider,
              active && styles.segmentActive,
            ]}
            onPress={() => onChange(key)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  control: {
    flexDirection: row,
    alignSelf: isRTL ? "flex-start" : "flex-end",
    height: 34,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 17,
    backgroundColor: "#fff",
    overflow: "hidden",
    // Rapproché de la ligne de statut (marge basse de 16 au-dessus).
    marginTop: -8,
    marginBottom: 16,
  },
  segment: {
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  segmentDivider: {
    borderStartWidth: 1,
    borderStartColor: colors.primary,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 14,
    color: colors.primary,
    fontFamily: fonts.regular,
    writingDirection: "rtl",
  },
  segmentTextActive: {
    color: "#fff",
    fontWeight: "600",
    fontFamily: fonts.semiBold,
  },
});
