import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../constants/theme";
import { rtlText, fonts } from "../constants/rtl";

/** Anneau de progression circulaire (react-native-svg) — fichier isolé pour ne pas charger SVG au boot superviseur. */
export function ProgressRing({
  size = 120,
  stroke = 10,
  progress = 0,
  color = colors.primary,
  trackColor = colors.border,
  children,
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Number(progress) || 0));
  const offset = circumference - (clamped / 100) * circumference;
  // Carré inscrit dans le disque intérieur, pour que le texte ne recouvre pas l'anneau.
  const innerPad = stroke + 6;
  const innerSize = Math.max(40, size - innerPad * 2);

  return (
    <View
      style={{
        width: size,
        height: size,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={offset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <View style={[styles.ringInnerBox, { width: innerSize, maxWidth: innerSize }]}>
          {children || (
            <Text style={[styles.ringText, { color }]}>{clamped}%</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  ringInnerBox: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ringText: {
    fontSize: 24,
    fontFamily: fonts.bold,
    ...rtlText,
    textAlign: "center",
  },
});
