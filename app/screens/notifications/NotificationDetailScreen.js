import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii } from "../../constants/theme";
import { rtlText, rtlTextCenter, fonts, arrowBack, row, isRTL } from "../../constants/rtl";

function formatReceivedAt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ar-MA", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function NotificationDetailScreen({ navigation, route }) {
  const params = route?.params && typeof route.params === "object" ? route.params : {};
  const title = String(params.title || "").trim() || "إشعار";
  const body = String(params.body || "").trim();
  const receivedAt = formatReceivedAt(params.createdAt);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <View style={styles.headerWrap}>
        <LinearGradient colors={colors.gradientHeader} style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={goBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="رجوع"
            >
              <Ionicons name={arrowBack} size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>الإشعار</Text>
            </View>
            <View style={styles.headerBtn} />
          </View>
        </LinearGradient>
      </View>

      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {receivedAt ? <Text style={styles.date}>{receivedAt}</Text> : null}

   
      </View>
    </SafeAreaView>
  );
}

const alignEdge = isRTL ? "flex-start" : "flex-end";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  header: {
    borderRadius: radii.lg,
    overflow: "hidden",
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 14,
  },
  headerRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    flex: 1,
    alignItems: alignEdge,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: fonts.bold,
    textAlign: "right",
    ...rtlText,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.text,
    ...rtlTextCenter,
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    ...rtlTextCenter,
  },
  date: {
    marginTop: 16,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
    ...rtlTextCenter,
  },
  backBtn: {
    marginTop: 28,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 36,
    minWidth: 160,
    alignItems: "center",
  },
  backBtnText: {
    color: "#fff",
    fontFamily: fonts.bold,
    fontSize: 15,
  },
});
