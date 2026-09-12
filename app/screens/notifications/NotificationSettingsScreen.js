import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "../../context/AppContext";
import { colors, radii, shadows } from "../../constants/theme";
import { rtlText, fonts, arrowBack, row, isRTL } from "../../constants/rtl";
import {
  getPushNotificationsToggleState,
  registerForPushNotifications,
  unregisterPushNotifications,
} from "../../lib/pushNotifications";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  emptyNotificationPreferences,
  getNotificationPreferences,
  updateNotificationPreferences,
  enqueueTestNotification,
} from "../../lib/notificationsApi";

export default function NotificationSettingsScreen({ navigation }) {
  const { currentUser, supabaseSession } = useApp();
  const authId = currentUser?.authId || supabaseSession?.user?.id || null;

  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [loadingDevice, setLoadingDevice] = useState(false);
  const [togglingDevice, setTogglingDevice] = useState(false);
  const [prefs, setPrefs] = useState(emptyNotificationPreferences());
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [sendingTest, setSendingTest] = useState(false);

  const loadDevice = useCallback(async () => {
    if (!authId) {
      setDeviceEnabled(false);
      return;
    }
    setLoadingDevice(true);
    const res = await getPushNotificationsToggleState(authId);
    if (res.ok) setDeviceEnabled(res.enabled === true);
    setLoadingDevice(false);
  }, [authId]);

  const loadPrefs = useCallback(async () => {
    setLoadingPrefs(true);
    const res = await getNotificationPreferences();
    if (res.ok) setPrefs(res.preferences);
    else if (res.error) Alert.alert("تنبيه", res.error);
    setLoadingPrefs(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDevice();
      loadPrefs();
    }, [loadDevice, loadPrefs])
  );

  const handleDeviceToggle = async (nextValue) => {
    if (!authId || togglingDevice) return;
    setTogglingDevice(true);
    if (nextValue) {
      const res = await registerForPushNotifications(authId);
      setTogglingDevice(false);
      if (!res.ok) {
        setDeviceEnabled(false);
        if (res.permissionDenied) {
          Alert.alert(
            "تنبيه",
            "لم يتم منح إذن الإشعارات. يمكنك تفعيلها من إعدادات الجهاز."
          );
        } else {
          Alert.alert("تنبيه", res.error || "تعذر تفعيل الإشعارات");
        }
        return;
      }
      setDeviceEnabled(true);
      return;
    }
    const res = await unregisterPushNotifications(authId);
    setTogglingDevice(false);
    if (!res.ok) {
      Alert.alert("تنبيه", res.error || "تعذر إيقاف الإشعارات");
      await loadDevice();
      return;
    }
    setDeviceEnabled(false);
  };

  const handleCategoryToggle = async (key, nextValue) => {
    setSavingKey(key);
    const res = await updateNotificationPreferences({ [key]: nextValue });
    setSavingKey(null);
    if (!res.ok) {
      Alert.alert("تنبيه", res.error || "تعذر حفظ الإعداد");
      return;
    }
    setPrefs(res.preferences);
  };

  const handleTest = async () => {
    setSendingTest(true);
    const res = await enqueueTestNotification(authId);
    setSendingTest(false);
    if (!res.ok) {
      Alert.alert("تنبيه", res.error || "تعذر إرسال الإشعار التجريبي");
      return;
    }
    Alert.alert(
      "تم",
      "أُرسل إشعار تجريبي. يظهر في الصندوق فورًا، والدفعة تصل إن كان الجهاز مسجّلًا."
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />

      <View style={styles.headerWrap}>
        <LinearGradient colors={colors.gradientHeader} style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.goBack()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="رجوع"
            >
              <Ionicons name={arrowBack} size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>إعدادات الإشعارات</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الجهاز</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>تفعيل إشعارات الجهاز</Text>
            {loadingDevice || togglingDevice ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Switch
                value={deviceEnabled}
                onValueChange={handleDeviceToggle}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="white"
                disabled={!authId}
              />
            )}
          </View>
          <Text style={styles.hint}>
            يسجّل هذا الجهاز لاستلام التنبيهات حتى عند إغلاق التطبيق
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>التصنيفات</Text>
          {loadingPrefs ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            NOTIFICATION_CATEGORIES.map((key, index) => (
              <View
                key={key}
                style={[
                  styles.switchRow,
                  index === NOTIFICATION_CATEGORIES.length - 1 && styles.switchRowLast,
                ]}
              >
                <Text style={styles.switchLabel}>
                  {NOTIFICATION_CATEGORY_LABELS[key]}
                </Text>
                {savingKey === key ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={prefs[key] !== false}
                    onValueChange={(v) => handleCategoryToggle(key, v)}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor="white"
                  />
                )}
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={styles.testBtn}
          onPress={handleTest}
          disabled={sendingTest || !authId}
          activeOpacity={0.85}
        >
          <Text style={styles.testBtnText}>
            {sendingTest ? "جاري الإرسال..." : "إرسال إشعار تجريبي"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  scroll: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderGreen,
    ...shadows.card,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 12,
    ...rtlText,
  },
  switchRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  switchRowLast: { borderBottomWidth: 0 },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text,
    ...rtlText,
  },
  hint: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 18,
    ...rtlText,
  },
  loader: { marginVertical: 12 },
  testBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  testBtnText: {
    color: "#fff",
    fontFamily: fonts.bold,
    fontSize: 15,
  },
});
