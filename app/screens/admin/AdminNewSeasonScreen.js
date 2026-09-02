import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell, CalendarPlus } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { rtlText, textAlignStart } from "../../constants/rtl";

const palette = {
  primary: "#2E7D32",
  gold: "#FBC02D",
  red: "#D32F2F",
  softGreen: "#E8F5E9",
  background: "#F5F5F5",
  textSecondary: "#666666",
  textPrimary: "#333333",
  placeholder: "#999999",
  border: "#E0E0E0",
};

export default function AdminNewSeasonScreen({ navigation }) {
  const { openSidebar, sidebar } = useAdminSidebar(navigation, "newSeason");
  const { startNewSeason, currentUser, stats } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const displayName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim()
    : "";
  const initial = displayName.charAt(0) || "م";
  const pendingCount = stats?.pendingRegs ?? 0;

  const handleStartSeason = async () => {
    if (saving) return;
    setSaving(true);
    const result = await startNewSeason({
      name,
      startDate,
      endDate,
      openRegistration: true,
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert("تنبيه", result.error);
      return;
    }
    setName("");
    setStartDate("");
    setEndDate("");
    Alert.alert(
      "انطلاق موسم جديد",
      `تم إنشاء «${result.season.name}» وفتح باب التسجيل.\nابدأ بإعداد حصص ومشرفي هذا الموسم.`,
      [{ text: "حسناً", onPress: () => navigation.goBack() }]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={openSidebar}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="فتح القائمة"
        >
          <Menu size={24} color={palette.textPrimary} pointerEvents="none" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>انطلاق موسم جديد</Text>
        <TouchableOpacity
          style={styles.topBarAvatar}
          onPress={() => navigation.navigate("AdminProfile")}
          hitSlop={8}
        >
          <Text style={styles.topBarAvatarText}>{initial}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
          {pendingCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {pendingCount > 9 ? "9+" : pendingCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + bottomGap },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <CalendarPlus size={18} color={palette.primary} pointerEvents="none" />
              <Text style={styles.formTitle}>إنشاء موسم جديد</Text>
            </View>
            <Text style={styles.formHint}>
              يُغلق الموسم العادي السابق تلقائياً ويُفتح باب التسجيل للأعضاء
            </Text>

            <Text style={styles.fieldLabel}>اسم الموسم</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="مثلاً: موسم 2026–2027"
              placeholderTextColor={palette.placeholder}
              value={name}
              onChangeText={setName}
              textAlign={textAlignStart}
            />

            <Text style={styles.fieldLabel}>تاريخ البداية</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="2026/09/01"
              placeholderTextColor={palette.placeholder}
              value={startDate}
              onChangeText={setStartDate}
              keyboardType="numbers-and-punctuation"
              textAlign={textAlignStart}
            />

            <Text style={styles.fieldLabel}>تاريخ النهاية</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="2027/06/30"
              placeholderTextColor={palette.placeholder}
              value={endDate}
              onChangeText={setEndDate}
              keyboardType="numbers-and-punctuation"
              textAlign={textAlignStart}
            />

            <TouchableOpacity
              style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
              onPress={handleStartSeason}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>
                {saving ? "جاري الإنشاء…" : "انطلاق موسم جديد"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {sidebar}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  flex: { flex: 1 },
  topBar: {
    backgroundColor: "#fff",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  topBarTitle: {
    flex: 1,
    fontWeight: "bold",
    color: palette.textPrimary,
    fontSize: 16,
    ...rtlText,
  },
  topBarAvatar: {
    width: 32,
    height: 32,
    backgroundColor: palette.softGreen,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarAvatarText: {
    color: palette.primary,
    fontWeight: "bold",
    fontSize: 14,
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    end: -6,
    backgroundColor: palette.red,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
  },
  scrollContent: {
    padding: 16,
  },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.textPrimary,
    ...rtlText,
  },
  formHint: {
    fontSize: 13,
    color: palette.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
    ...rtlText,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: palette.textSecondary,
    marginBottom: 6,
    ...rtlText,
  },
  fieldInput: {
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.textPrimary,
    marginBottom: 14,
    ...rtlText,
  },
  submitBtn: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    ...rtlText,
  },
});
