/** Thème aligné sur l’écran d’inscription (vert #337D3D) */
export const colors = {
  primary: "#337D3D",
  primaryDark: "#2A6632",
  primarySoft: "#E8F3EA",
  gold: "#EAB308",
  goldSoft: "#F3E6B8",
  accent: "#EAB308",
  orange: "#D97706",
  blue: "#2563EB",
  green: "#337D3D",
  indigo: "#5C6BC0",
  teal: "#0D9488",
  red: "#DC2626",
  bg: "#FFFFFF",
  card: "#FFFFFF",
  text: "#1F2937",
  textSecondary: "#374151",
  muted: "#6B7280",
  placeholder: "#9CA3AF",
  border: "#E5E7EB",
  borderGreen: "#BBF7D0",
  borderBlue: "#BBF7D0",
  borderGold: "#FDE68A",
  soft: "#E8F3EA",
  inputBg: "#F2F2F2",
  /** Dégradé du header d'accueil membre (maquette) */
  gradientHeader: ["#2E7D32", "#388E3C"],
};

export const radii = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const roleTheme = {
  admin: {
    primary: colors.primary,
    border: colors.borderGreen,
    soft: colors.soft,
    icon: "shield",
  },
  supervisor: {
    primary: colors.primary,
    border: colors.borderGreen,
    soft: colors.soft,
    icon: "shield-checkmark",
  },
  member: {
    primary: colors.primary,
    border: colors.borderGreen,
    soft: colors.soft,
    icon: "book",
  },
};
