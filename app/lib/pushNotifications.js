import { Platform, NativeModules } from "react-native";
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo-modules-core";
import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

let notificationsModule = null;
let deviceModule = null;
let handlerConfigured = false;
let pushModulesUnavailable = false;

function canUsePushNativeModules() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return false;
  }
  const hasNotifications =
    !!NativeModules.ExpoPushTokenManager || !!NativeModules.ExpoNotifications;
  const hasDevice = !!NativeModules.ExpoDevice;
  return hasNotifications && hasDevice;
}

function isNativePushRuntimeAvailable() {
  return (
    requireOptionalNativeModule("ExpoDevice") != null &&
    requireOptionalNativeModule("ExpoPushTokenManager") != null
  );
}

function resolveModuleNamespace(mod) {
  if (!mod) return null;
  if (typeof mod.setNotificationHandler === "function" || typeof mod.isDevice === "boolean") {
    return mod;
  }
  if (mod.default) {
    return mod.default;
  }
  return mod;
}

async function loadPushModules() {
  if (pushModulesUnavailable) {
    return null;
  }
  if (notificationsModule && deviceModule) {
    return { notifications: notificationsModule, device: deviceModule };
  }
  if (!canUsePushNativeModules()) {
    pushModulesUnavailable = true;
    return null;
  }

  if (!isNativePushRuntimeAvailable()) {
    pushModulesUnavailable = true;
    return null;
  }

  try {
    const [notificationsImport, deviceImport] = await Promise.all([
      import("expo-notifications"),
      import("expo-device"),
    ]);

    const notifications = resolveModuleNamespace(notificationsImport);
    const device = resolveModuleNamespace(deviceImport);

    if (
      !notifications ||
      typeof notifications.setNotificationHandler !== "function" ||
      typeof notifications.getExpoPushTokenAsync !== "function" ||
      !device ||
      typeof device.isDevice !== "boolean"
    ) {
      pushModulesUnavailable = true;
      return null;
    }

    notificationsModule = notifications;
    deviceModule = device;

    if (!handlerConfigured) {
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      handlerConfigured = true;
    }

    return { notifications, device };
  } catch (e) {
    pushModulesUnavailable = true;
    if (__DEV__) {
      console.warn("[push] native modules unavailable:", e?.message || e);
    }
    return null;
  }
}

function mapPushTokensError(error) {
  const msg = error?.message || "";
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return "جدول push_tokens غير موجود";
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  return mapSupabaseAuthError(error);
}

function getExpoProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId || null;
}

async function ensureAndroidNotificationChannel(Notifications) {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function getCurrentExpoPushToken(Notifications) {
  const projectId = getExpoProjectId();
  if (!projectId) {
    return { ok: false, error: "معرّف مشروع Expo مفقود" };
  }

  await ensureAndroidNotificationChannel(Notifications);
  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResult?.data;
  if (!token) {
    return { ok: false, error: "تعذر الحصول على رمز الإشعارات" };
  }
  return { ok: true, token };
}

function pushNativeUnavailableError() {
  const inExpoGo = Constants.appOwnership === "expo";
  return {
    ok: false,
    error: inExpoGo
      ? "حدّث تطبيق Expo Go إلى آخر إصدار (SDK 54) لتفعيل الإشعارات"
      : "إشعارات الجهاز غير متاحة — أعد بناء التطبيق: npx expo run:android",
  };
}

/**
 * Enregistre ou réassocie le token Expo Push du device courant (upsert par expo_push_token).
 */
export async function registerForPushNotifications(userId, options = {}) {
  const { requestPermission = true } = options;

  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!userId) {
    return { ok: false, error: "معرّف المستخدم مفقود" };
  }

  const modules = await loadPushModules();
  if (!modules) {
    return pushNativeUnavailableError();
  }

  const { notifications: Notifications, device: Device } = modules;

  if (!Device.isDevice) {
    return { ok: false, error: "الإشعارات غير متاحة على المحاكي" };
  }
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { ok: false, error: "الإشعارات غير متاحة على هذا المنصة" };
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      if (!requestPermission) {
        return {
          ok: false,
          error: "لم يتم منح إذن الإشعارات",
          permissionDenied: true,
        };
      }
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return {
        ok: false,
        error: "لم يتم منح إذن الإشعارات",
        permissionDenied: true,
      };
    }

    const tokenRes = await getCurrentExpoPushToken(Notifications);
    if (!tokenRes.ok) {
      return { ok: false, error: tokenRes.error };
    }

    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: userId,
        expo_push_token: tokenRes.token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "expo_push_token" }
    );

    if (error) {
      return { ok: false, error: mapPushTokensError(error) };
    }

    return { ok: true, token: tokenRes.token };
  } catch (e) {
    console.warn("[push] registerForPushNotifications:", e?.message || e);
    return { ok: false, error: e?.message || "تعذر تسجيل الإشعارات" };
  }
}

export async function unregisterPushNotifications(userId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!userId) {
    return { ok: false, error: "معرّف المستخدم مفقود" };
  }

  const modules = await loadPushModules();
  if (!modules) {
    return { ok: true };
  }

  const { notifications: Notifications } = modules;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      return { ok: true };
    }

    const tokenRes = await getCurrentExpoPushToken(Notifications);
    if (!tokenRes.ok || !tokenRes.token) {
      return { ok: true };
    }

    const { error } = await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("expo_push_token", tokenRes.token);

    if (error) {
      return { ok: false, error: mapPushTokensError(error) };
    }

    return { ok: true };
  } catch (e) {
    console.warn("[push] unregisterPushNotifications:", e?.message || e);
    return { ok: false, error: e?.message || "تعذر إلغاء الإشعارات" };
  }
}

export async function getPushNotificationsToggleState(userId) {
  if (!isSupabaseConfigured() || !userId) {
    return { ok: true, enabled: false };
  }

  const modules = await loadPushModules();
  if (!modules) {
    return { ok: true, enabled: false };
  }

  const { notifications: Notifications } = modules;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      return { ok: true, enabled: false };
    }

    const tokenRes = await getCurrentExpoPushToken(Notifications);
    if (!tokenRes.ok || !tokenRes.token) {
      return { ok: true, enabled: false };
    }

    const { data, error } = await supabase
      .from("push_tokens")
      .select("id")
      .eq("user_id", userId)
      .eq("expo_push_token", tokenRes.token)
      .maybeSingle();

    if (error) {
      return { ok: false, enabled: false, error: mapPushTokensError(error) };
    }

    return { ok: true, enabled: !!data };
  } catch (e) {
    console.warn("[push] getPushNotificationsToggleState:", e?.message || e);
    return { ok: true, enabled: false };
  }
}

export async function refreshPushRegistrationIfEnabled(userId) {
  if (!isSupabaseConfigured() || !userId) {
    return { ok: true, skipped: true };
  }

  const modules = await loadPushModules();
  if (!modules) {
    return { ok: true, skipped: true };
  }

  const { device: Device } = modules;
  if (!Device.isDevice) {
    return { ok: true, skipped: true };
  }

  const stateRes = await getPushNotificationsToggleState(userId);
  if (!stateRes.ok || !stateRes.enabled) {
    return { ok: true, skipped: true };
  }

  const regRes = await registerForPushNotifications(userId, {
    requestPermission: false,
  });
  if (!regRes.ok) {
    console.warn("[push] refreshPushRegistrationIfEnabled:", regRes.error);
    return { ok: false, error: regRes.error };
  }
  return { ok: true };
}
