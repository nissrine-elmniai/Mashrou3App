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
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
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
  updateQuietHours,
} from "../../lib/notificationsApi";

const QUIET_START_DEFAULT = "22:00";
const QUIET_END_DEFAULT = "07:00";

function hmToDate(hm) {
  const date = new Date();
  const match = String(hm || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    date.setHours(22, 0, 0, 0);
    return date;
  }
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

function dateToHm(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default function NotificationSettingsScreen({ navigation }) {
  const { currentUser, supabaseSession } = useApp();
  const authId = currentUser?.authId || supabaseSession?.user?.id || null;

  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [loadingDevice, setLoadingDevice] = useState(false);
  const [togglingDevice, setTogglingDevice] = useState(false);
  const [prefs, setPrefs] = useState(emptyNotificationPreferences());
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [savingQuiet, setSavingQuiet] = useState(false);
  const [quietPicker, setQuietPicker] = useState(null);
  const [quietDraft, setQuietDraft] = useState(null);

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

  const quietStartShown =
    quietPicker === "start" && quietDraft
      ? quietDraft
      : prefs.quietHoursStart || QUIET_START_DEFAULT;
  const quietEndShown =
    quietPicker === "end" && quietDraft
      ? quietDraft
      : prefs.quietHoursEnd || QUIET_END_DEFAULT;

  const applyQuietHours = async (next) => {
    const prev = prefs;
    setPrefs(next);
    setSavingQuiet(true);
    const res = await updateQuietHours(authId, {
      enabled: next.quietHoursEnabled === true,
      start: next.quietHoursStart,
      end: next.quietHoursEnd,
    });
    setSavingQuiet(false);
    if (!res.ok) {
      setPrefs(prev);
      Alert.alert("تنبيه", res.error || "تعذر حفظ الساعات الهادئة");
      return;
    }
    if (res.preferences) setPrefs(res.preferences);
  };

  const handleQuietToggle = (nextEnabled) => {
    if (savingQuiet) return;
    setQuietPicker(null);
    setQuietDraft(null);
    if (nextEnabled) {
      applyQuietHours({
        ...prefs,
        quietHoursEnabled: true,
        quietHoursStart: prefs.quietHoursStart || QUIET_START_DEFAULT,
        quietHoursEnd: prefs.quietHoursEnd || QUIET_END_DEFAULT,
      });
      return;
    }
    applyQuietHours({
      ...prefs,
      quietHoursEnabled: false,
    });
  };

  const commitQuietTime = (field, hhmm) => {
    const start = field === "start" ? hhmm : prefs.quietHoursStart || QUIET_START_DEFAULT;
    const end = field === "end" ? hhmm : prefs.quietHoursEnd || QUIET_END_DEFAULT;
    const stored = field === "start" ? prefs.quietHoursStart : prefs.quietHoursEnd;
    if (stored === hhmm) return;
    applyQuietHours({
      ...prefs,
      quietHoursEnabled: true,
      quietHoursStart: start,
      quietHoursEnd: end,
    });
  };

  const onQuietTimeChange = (event, selected) => {
    const field = quietPicker;
    if (Platform.OS !== "ios") setQuietPicker(null);
    if (event?.type === "dismissed" || !selected || !field) return;
    const hhmm = dateToHm(selected);
    if (Platform.OS === "ios") {
      setQuietDraft(hhmm);
      return;
    }
    commitQuietTime(field, hhmm);
  };

  const confirmIosQuietTime = () => {
    const field = quietPicker;
    const hhmm =
      quietDraft || (field === "start" ? quietStartShown : quietEndShown);
    setQuietPicker(null);
    setQuietDraft(null);
    if (field && hhmm) commitQuietTime(field, hhmm);
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
            يسجّل هذا الجهاز لاستلام الإشعارات حتى عند إغلاق التطبيق
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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>الساعات الهادئة</Text>
          {loadingPrefs ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>تفعيل الساعات الهادئة</Text>
                {savingQuiet ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={prefs.quietHoursEnabled === true}
                    onValueChange={handleQuietToggle}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor="white"
                    disabled={!authId}
                  />
                )}
              </View>
              <Text style={styles.hint}>
                لن تصلك الإشعارات خلال هذه الفترة، وستُرسل بعد انتهائها
              </Text>
              {prefs.quietHoursEnabled === true ? (
                <>
                  <TouchableOpacity
                    style={styles.timeRow}
                    onPress={() => {
                      setQuietDraft(null);
                      setQuietPicker("start");
                    }}
                    disabled={savingQuiet}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel="من"
                  >
                    <Text style={styles.switchLabel}>من</Text>
                    <Text style={styles.timeValue}>{quietStartShown}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.timeRow, styles.switchRowLast]}
                    onPress={() => {
                      setQuietDraft(null);
                      setQuietPicker("end");
                    }}
                    disabled={savingQuiet}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel="إلى"
                  >
                    <Text style={styles.switchLabel}>إلى</Text>
                    <Text style={styles.timeValue}>{quietEndShown}</Text>
                  </TouchableOpacity>
                  {quietPicker ? (
                    <DateTimePicker
                      value={hmToDate(
                        quietPicker === "start" ? quietStartShown : quietEndShown
                      )}
                      mode="time"
                      is24Hour
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={onQuietTimeChange}
                    />
                  ) : null}
                  {Platform.OS === "ios" && quietPicker ? (
                    <TouchableOpacity
                      style={styles.timeDoneBtn}
                      onPress={confirmIosQuietTime}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.timeDoneText}>تم</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </View>
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
  timeRow: {
    flexDirection: row,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    marginTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  timeValue: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.primary,
    ...rtlText,
  },
  timeDoneBtn: {
    alignSelf: "center",
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  timeDoneText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});
