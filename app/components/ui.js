import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  I18nManager,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { colors, radii, shadows } from "../constants/theme";
import {
  rtlText,
  rtlTextBold,
  fonts,
  row,
  textAlignStart,
  arrowBack,
} from "../constants/rtl";

/** Marge basse minimale (Android renvoie souvent 0 pour insets.bottom) */
const MIN_BOTTOM_GAP = 16;

const alignEdge = I18nManager.isRTL ? "flex-start" : "flex-end";

/**
 * Header RTL arabe :
 * - Droite (début) : icône + titre
 * - Gauche (fin) : déconnexion / retour
 */
export function AppHeader({
  title,
  subtitle,
  primary = colors.primary,
  icon = "shield",
  onLogout,
  onBack,
  rightAction,
}) {
  return (
    <View style={[styles.header, { backgroundColor: primary }]}>
      <View style={styles.headerStart}>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={22} color={primary} />
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.headerEnd}>
        {onBack ? (
          <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
            <Text style={styles.headerBtnText}>رجوع</Text>
            <Ionicons name={arrowBack} size={20} color="white" />
          </TouchableOpacity>
        ) : null}
        {onLogout ? (
          <TouchableOpacity style={styles.headerBtn} onPress={onLogout}>
            <Text style={styles.headerBtnText}>تسجيل الخروج</Text>
            <Ionicons name="log-out-outline" size={20} color="white" />
          </TouchableOpacity>
        ) : null}
        {rightAction}
      </View>
    </View>
  );
}

/** Onglets RTL sous le header */
export function AppTabs({ tabs, activeKey, onChange, primary = colors.primary }) {
  return (
    <View style={styles.tabs}>
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, active && { borderBottomColor: primary }]}
            onPress={() => onChange(t.key)}
          >
            <Text style={[styles.tabText, active && { color: primary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function AppShell({
  title,
  subtitle,
  icon,
  primary = colors.primary,
  onLogout,
  onBack,
  tabs,
  activeTab,
  onTabChange,
  children,
  scroll = true,
}) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, MIN_BOTTOM_GAP);

  const body = scroll ? (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, { paddingBottom: 32 + bottomPad }]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, { paddingBottom: bottomPad }]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={primary} />
      <AppHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        primary={primary}
        onLogout={onLogout}
        onBack={onBack}
      />
      {tabs?.length ? (
        <AppTabs
          tabs={tabs}
          activeKey={activeTab}
          onChange={onTabChange}
          primary={primary}
        />
      ) : null}
      {body}
    </SafeAreaView>
  );
}

export function GoldDivider() {
  return <View style={styles.goldDivider} />;
}

export function StatCard({
  icon,
  iconColor = colors.primary,
  borderColor = colors.borderGreen,
  label,
  value,
  valueColor = colors.primary,
}) {
  return (
    <View style={[styles.statCard, { borderColor }, shadows.card]}>
      {/* Valeur à gauche, libellé+icône à droite (flux arabe) */}
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      <View style={styles.statLabelRow}>
        <Text style={styles.statLabel}>{label}</Text>
        {icon ? <Ionicons name={icon} size={22} color={iconColor} /> : null}
      </View>
    </View>
  );
}

export function SectionCard({
  title,
  subtitle,
  primary = colors.primary,
  borderColor = colors.borderGreen,
  children,
}) {
  return (
    <View style={[styles.sectionCard, { borderColor }, shadows.card]}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: primary }]}>{title}</Text>
      ) : null}
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {title ? <View style={styles.cardGoldLine} /> : null}
      {children}
    </View>
  );
}

export function QuickButton({ color = colors.primary, icon, label, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.quickBtn, { backgroundColor: color }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={styles.quickBtnText}>{label}</Text>
      {icon ? <Ionicons name={icon} size={22} color="white" /> : null}
    </TouchableOpacity>
  );
}

export function SoftButton({ label, onPress, active = false }) {
  return (
    <TouchableOpacity
      style={[styles.softBtn, active && styles.softBtnActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.softBtnText, active && styles.softBtnTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function FormInput(props) {
  return (
    <TextInput
      {...props}
      style={[styles.formInput, props.style]}
      placeholderTextColor={colors.placeholder}
      textAlign={textAlignStart}
    />
  );
}

export function PersonCard({
  initials,
  name,
  meta = [],
  accent = colors.primary,
  pill,
  trailing,
}) {
  return (
    <View style={[styles.personCard, shadows.card]}>
      {/* Avatar à droite (début RTL) */}
      <View style={[styles.avatar, { backgroundColor: accent }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.personInfo}>
        <Text style={styles.personName}>{name}</Text>
        {meta.map((m, i) => (
          <Text key={i} style={styles.personMeta}>
            {m}
          </Text>
        ))}
        {pill ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{pill}</Text>
          </View>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function EmptyState({ text }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  onLogout,
  rightIcon = "shield",
  primary = colors.primary,
}) {
  return (
    <AppHeader
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      onLogout={onLogout}
      icon={rightIcon}
      primary={primary}
    />
  );
}

export function ActionButton({
  label,
  onPress,
  color = colors.primary,
  icon,
}) {
  return (
    <QuickButton label={label} onPress={onPress} color={color} icon={icon} />
  );
}

export function StatRow({ label, value, color = colors.primary }) {
  return (
    <StatCard
      label={label}
      value={value}
      valueColor={color}
      iconColor={color}
      borderColor={colors.borderGreen}
    />
  );
}

/** Anneau de progression circulaire (react-native-svg), % centré par défaut */
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

/** Barre d'onglets basse interne (icônes lucide passées via tabs[].icon) */
export function MemberBottomTabBar({ tabs, activeKey, onChange }) {
  return (
    <View style={styles.bottomBar}>
      {tabs.map((t) => {
        const active = t.key === activeKey;
        const Icon = t.icon;
        return (
          <TouchableOpacity
            key={t.key}
            style={styles.bottomTab}
            onPress={() => onChange(t.key)}
            activeOpacity={0.7}
          >
            <Icon
              size={22}
              color={active ? colors.primary : colors.muted}
              strokeWidth={active ? 2.4 : 2}
            />
            <Text
              style={[
                styles.bottomTabLabel,
                active && styles.bottomTabLabelActive,
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Petite pill de statistique (fond clair + couleur d'accent) */
export function StatChip({ icon, label, value, color = colors.primary }) {
  return (
    <View style={[styles.statChip, { borderColor: color }]}>
      {icon ? <Ionicons name={icon} size={16} color={color} /> : null}
      <Text style={styles.statChipLabel}>{label}</Text>
      <Text style={[styles.statChipValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerStart: {
    flexDirection: row,
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  headerEnd: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
  },
  headerBtn: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
  },
  headerBtnText: {
    color: "white",
    fontWeight: "600",
    fontSize: 13,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  headerTextWrap: { alignItems: alignEdge, flexShrink: 1 },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    marginTop: 2,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },

  tabs: {
    flexDirection: row,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabText: {
    color: colors.placeholder,
    fontFamily: fonts.semiBold,
    fontSize: 14,
    ...rtlText,
  },

  goldDivider: {
    width: 80,
    height: 4,
    backgroundColor: colors.gold,
    borderRadius: 2,
    alignSelf: "center",
    marginVertical: 8,
  },
  cardGoldLine: {
    width: 48,
    height: 3,
    backgroundColor: colors.gold,
    borderRadius: 2,
    alignSelf: alignEdge,
    marginBottom: 14,
    marginTop: 2,
  },

  statCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    flexDirection: row,
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1.5,
  },
  statValue: {
    fontSize: 28,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  statLabelRow: {
    flexDirection: row,
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 14,
    fontFamily: fonts.regular,
    ...rtlText,
  },

  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 20,
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    ...rtlTextBold,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontFamily: fonts.regular,
    ...rtlText,
    marginTop: 4,
  },

  quickBtn: {
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    gap: 6,
    flexDirection: row,
  },
  quickBtnText: {
    color: "white",
    fontFamily: fonts.bold,
    fontSize: 16,
    textAlign: "center",
    writingDirection: "rtl",
  },

  softBtn: {
    backgroundColor: colors.soft,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderGreen,
  },
  softBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  softBtnText: {
    textAlign: "center",
    color: colors.primaryDark,
    fontSize: 14,
    fontFamily: fonts.semiBold,
    writingDirection: "rtl",
  },
  softBtnTextActive: { color: "white" },

  formInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.bg,
    marginBottom: 10,
    fontSize: 15,
    color: colors.text,
    fontFamily: fonts.regular,
    ...rtlText,
  },

  personCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 12,
    flexDirection: row,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    gap: 12,
    alignItems: "center",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "white",
    fontFamily: fonts.bold,
  },
  personInfo: { flex: 1, alignItems: alignEdge },
  personName: {
    fontFamily: fonts.bold,
    fontSize: 16,
    ...rtlTextBold,
    color: colors.text,
  },
  personMeta: {
    color: colors.muted,
    ...rtlText,
    marginTop: 3,
    fontSize: 13,
  },
  pill: {
    alignSelf: alignEdge,
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginTop: 8,
  },
  pillText: {
    fontFamily: fonts.semiBold,
    fontSize: 12,
    color: colors.primaryDark,
    ...rtlText,
  },

  empty: { padding: 24, alignItems: "center" },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    fontFamily: fonts.regular,
    writingDirection: "rtl",
  },

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

  bottomBar: {
    flexDirection: row,
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    paddingBottom: 8,
    ...shadows.card,
  },
  bottomTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bottomTabLabel: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.semiBold,
    ...rtlText,
  },
  bottomTabLabelActive: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },

  statChip: {
    flexDirection: row,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    backgroundColor: colors.soft,
    marginEnd: 8,
    marginBottom: 8,
  },
  statChipLabel: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.regular,
    ...rtlText,
  },
  statChipValue: {
    fontSize: 14,
    fontFamily: fonts.bold,
    ...rtlText,
  },
});
