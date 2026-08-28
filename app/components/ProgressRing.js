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
      <View style={styles.ringCenter}>
        {children || <Text style={[styles.ringText, { color }]}>{clamped}%</Text>}
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
  ringText: {
    fontSize: 24,
    fontFamily: fonts.bold,
    ...rtlText,
    textAlign: "center",
  },
});
