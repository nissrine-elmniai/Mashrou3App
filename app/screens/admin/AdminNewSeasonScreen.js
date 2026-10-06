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
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell, CalendarPlus } from "lucide-react-native";
import { useApp } from "../../context/AppContext";
import { useAdminSidebar } from "../../components/AdminSidebar";
import { rtlText, textAlignStart, row } from "../../constants/rtl";
import { SEASON_TYPES, SEASON_TYPE_LABELS } from "../../constants/roles";
import { colors } from "../../constants/theme";
import AdminTopBarAvatar from "../../components/admin/AdminTopBarAvatar";
import InboxHeaderButton from "../../components/InboxHeaderButton";
import { parseSeasonStartDate } from "../../lib/saisonsApi";

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
  const { openSidebar, sidebar, messagesFab } = useAdminSidebar(navigation, "newSeason");
  const { startNewSeason, confirmCurrentPassword, currentUser, stats } = useApp();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(insets.bottom, 16);

  const [seasonType, setSeasonType] = useState(SEASON_TYPES.REGULAR);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [version, setVersion] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [passwordStep, setPasswordStep] = useState(false);
  const [password, setPassword] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);

  const pendingCount = stats?.pendingRegs ?? 0;
  const seasonName = name.trim();
  const typeLabel =
    SEASON_TYPE_LABELS[seasonType] || SEASON_TYPE_LABELS.regular;

  const closeConfirm = () => {
    if (saving) return;
    setPassword("");
    setPasswordStep(false);
    setFailedAttempts(0);
    setConfirmOpen(false);
  };

  const openConfirm = () => {
    if (saving) return;
    const versionNum = Number.parseInt(String(version || "").trim(), 10);
    const start = parseSeasonStartDate(startDate);
    if (!seasonName || !Number.isFinite(versionNum) || versionNum < 1) {
      Alert.alert("تنبيه", "املأ جميع الحقول");
      return;
    }
    if (!start) {
      Alert.alert("تنبيه", "صيغة التاريخ غير صالحة — استخدم 2026/09/01");
      return;
    }
    setPassword("");
    setPasswordStep(false);
    setFailedAttempts(0);
    setConfirmOpen(true);
  };

  const handleVerifyAndStart = async () => {
    if (saving) return;
    const typed = password;
    setPassword("");
    if (!typed) {
      Alert.alert("تنبيه", "أدخل كلمة المرور");
      return;
    }
    setSaving(true);
    try {
      const check = await confirmCurrentPassword(typed);
      if (!check.ok) {
        if (check.error === "SESSION_INTROUVABLE") {
          Alert.alert("تنبيه", "تعذر التحقق من الجلسة");
          return;
        }
        const next = failedAttempts + 1;
        if (next >= 3) {
          setPasswordStep(false);
          setFailedAttempts(0);
          setConfirmOpen(false);
          Alert.alert("تنبيه", "تم إلغاء العملية بعد 3 محاولات فاشلة");
          return;
        }
        setFailedAttempts(next);
        Alert.alert("تنبيه", "كلمة المرور غير صحيحة");
        return;
      }
      setFailedAttempts(0);
      const result = await startNewSeason({
        name,
        startDate,
        version,
        type: seasonType,
      });
      if (!result.ok) {
        Alert.alert("تنبيه", result.error);
        return;
      }
      setConfirmOpen(false);
      setPasswordStep(false);
      setSeasonType(SEASON_TYPES.REGULAR);
      setName("");
      setStartDate("");
      setVersion("");
      const deleted = result.supervisorsDeleted ?? 0;
      const total = result.supervisorsTotal ?? 0;
      const leftover =
        deleted < total
          ? "\nالحسابات المتبقية بقيت معطّلة ويمكن حذفها لاحقاً من شاشة المشرفين."
          : "";
      Alert.alert(
        `انطلاق ${typeLabel}`,
        `تم إنشاء «${result.season.name}» (${typeLabel}) وفتح باب التسجيل.\nتم حذف ${deleted} من أصل ${total} مشرفين.\nابدأ بإعداد الحصص ودعوة المشرفين.${leftover}`,
        [{ text: "حسناً", onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert("تنبيه", e?.message || "تعذر انطلاق الموسم");
    } finally {
      setSaving(false);
    }
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
        <AdminTopBarAvatar
          currentUser={currentUser}
          onPress={() => navigation.navigate("AdminProfile")}
        />
        <InboxHeaderButton
          navigation={navigation}
          color={colors.muted}
          variant="lucide"
          size={24}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate("AdminRegistrations")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="طلبات الانضمام والتسجيل"
        >
          <Bell size={24} color={palette.textSecondary} pointerEvents="none" />
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
              يُغلق كل موسم نشط ويُفتح التسجيل في الموسم الجديد. التأكيد يعرض
              ما يُحذف وما يبقى.
            </Text>

            <Text style={styles.fieldLabel}>نوع الموسم</Text>
            <View style={styles.typeRow}>
              {[SEASON_TYPES.REGULAR, SEASON_TYPES.SUMMER].map((value) => {
                const active = seasonType === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => setSeasonType(value)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        active && styles.typeChipTextActive,
                      ]}
                    >
                      {SEASON_TYPE_LABELS[value]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>اسم الموسم</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="مثلاً: الموسم السابع  "
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

            <Text style={styles.fieldLabel}>رقم النسخة</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="1"
              placeholderTextColor={palette.placeholder}
              value={version}
              onChangeText={setVersion}
              keyboardType="number-pad"
              textAlign={textAlignStart}
            />

            <TouchableOpacity
              style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
              onPress={openConfirm}
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
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={closeConfirm}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{`تأكيد انطلاق ${typeLabel}`}</Text>
            <Text style={styles.modalLead}>
              سيُحذف نهائياً، لكل المواسم (العادي والصيفي):
            </Text>
            <Text style={styles.modalList}>
              حسابات المشرفين (ما عدا الإدارة)، دعواتهم، طلبات التسجيل، الحصص
              وتسجيلاتها والحضور ومحادثاتها، الاختبارات ودرجاتها، التنبيهات
              والإشعارات، أهداف الموسم، وبرامج الحفظ والمراجعة.
            </Text>
            <Text style={styles.modalLead}>سيبقى محفوظاً:</Text>
            <Text style={styles.modalList}>
              حسابات الأعضاء، التقدم، سجلات المواسم السابقة
              (تُغلق)، وإحصائيات المواسم المحفوظة.
            </Text>
            {passwordStep ? (
              <>
                <Text style={styles.modalLead}>{`النوع: ${typeLabel}`}</Text>
                <Text style={styles.modalLead}>أدخل كلمة مرور المشرف العام</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="كلمة المرور"
                  placeholderTextColor={palette.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  editable={!saving}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textAlign={textAlignStart}
                />
                <TouchableOpacity
                  style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
                  onPress={handleVerifyAndStart}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Text style={styles.submitBtnText}>
                    {saving ? "جاري الإنشاء…" : "تحقق وإنشاء الموسم"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
                onPress={() => setPasswordStep(true)}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>تأكيد الانطلاق</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={closeConfirm}
              disabled={saving}
            >
              <Text style={styles.modalCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {messagesFab}
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
  typeRow: {
    flexDirection: row,
    gap: 8,
    marginBottom: 14,
  },
  typeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#FAFAFA",
  },
  typeChipActive: {
    borderColor: palette.primary,
    backgroundColor: palette.softGreen,
  },
  typeChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: palette.textSecondary,
    ...rtlText,
  },
  typeChipTextActive: {
    color: palette.primary,
    fontWeight: "700",
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: palette.textPrimary,
    marginBottom: 10,
    ...rtlText,
  },
  modalLead: {
    fontSize: 14,
    fontWeight: "700",
    color: palette.textPrimary,
    marginTop: 8,
    marginBottom: 4,
    ...rtlText,
  },
  modalList: {
    fontSize: 13,
    color: palette.textSecondary,
    lineHeight: 20,
    ...rtlText,
  },
  modalCancel: {
    alignItems: "center",
    paddingVertical: 12,
  },
  modalCancelText: {
    color: palette.textSecondary,
    fontSize: 15,
    fontWeight: "600",
    ...rtlText,
  },
});
