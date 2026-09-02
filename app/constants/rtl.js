import { Platform, I18nManager, StyleSheet, Text, TextInput } from "react-native";

export const isRTL = I18nManager.isRTL;

/** Polices système avec bon support arabe */
const systemArabic = Platform.select({
  ios: "GeezaPro",
  android: "sans-serif",
  default: undefined,
});

let cairoLoaded = false;

export function setCairoLoaded(value) {
  cairoLoaded = !!value;
}

export const fonts = {
  get regular() {
    return cairoLoaded ? "Cairo_400Regular" : systemArabic;
  },
  get medium() {
    return cairoLoaded ? "Cairo_500Medium" : systemArabic;
  },
  get semiBold() {
    return cairoLoaded ? "Cairo_600SemiBold" : systemArabic;
  },
  get bold() {
    return cairoLoaded ? "Cairo_700Bold" : systemArabic;
  },
  fallback: systemArabic,
};

/**
 * Avec I18nManager RTL actif : start = droite visuelle.
 * Sinon (Expo Go parfois) : forcer right.
 */
export const textAlignStart = I18nManager.isRTL ? "start" : "right";

/**
 * Avec RTL natif, "row" est déjà inversé.
 * Sans RTL natif, on utilise row-reverse.
 */
const flexRowDirection = I18nManager.isRTL ? "row" : "row-reverse";
export const row = flexRowDirection;

export function getRtlText(weight = "regular") {
  const family = fonts[weight] || fonts.regular;
  return {
    textAlign: textAlignStart,
    writingDirection: "rtl",
    ...(family ? { fontFamily: family } : {}),
  };
}

/** Texte de contenu arabe (aligné au début = droite) */
export const rtlText = {
  textAlign: textAlignStart,
  writingDirection: "rtl",
};

export const rtlTextBold = {
  textAlign: textAlignStart,
  writingDirection: "rtl",
  fontWeight: "700",
};

export const rtlTextSemi = {
  textAlign: textAlignStart,
  writingDirection: "rtl",
  fontWeight: "600",
};

export const rtlTextCenter = {
  textAlign: "center",
  writingDirection: "rtl",
};

export const rtlStyles = StyleSheet.create({
  text: rtlText,
  textCenter: rtlTextCenter,
  itemRow: {
    flexDirection: flexRowDirection,
    alignItems: "center",
  },
  rowBetween: {
    flexDirection: flexRowDirection,
    justifyContent: "space-between",
    alignItems: "center",
  },
  colStart: {
    alignItems: "flex-start",
  },
});

/**
 * Icônes directionnelles RTL-aware.
 * En RTL : "back" = arrow-forward (→), "forward" = arrow-back (←)
 */
export const arrowBack = I18nManager.isRTL ? "arrow-forward" : "arrow-back";
export const arrowForward = I18nManager.isRTL ? "arrow-back" : "arrow-forward";

/**
 * Police arabe globale — sans forcer textAlign sur tous les Text
 * (sinon les titres centrés du login partent à droite).
 */
export function applyGlobalRtlTypography() {
  // I18nManager.allowRTL/forceRTL are handled in index.js before rendering.
  // This only applies default text styles globally for Arabic shaping.

  const family = fonts.regular;
  const baseStyle = {
    writingDirection: "rtl",
    ...(family ? { fontFamily: family } : {}),
  };

  Text.defaultProps = {
    ...(Text.defaultProps || {}),
    style: [baseStyle, Text.defaultProps?.style].filter(Boolean),
  };

  TextInput.defaultProps = {
    ...(TextInput.defaultProps || {}),
    textAlign: textAlignStart,
    style: [baseStyle, TextInput.defaultProps?.style].filter(Boolean),
  };
}
