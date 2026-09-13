import { markNotificationRead } from "./notificationsApi";

/** Écrans autorisés pour la navigation au tap (payload.screen). */
const ALLOWED_SCREENS = new Set([
  "NotificationInbox",
  "NotificationSettings",
  "NotificationDetail",
  "ChatConversation",
  "GroupChat",
  "MemberChatInbox",
  "SupervisorMessages",
  "AdminChat",
  "MemberAlerts",
  "SupervisorAlerts",
  "AdminNotifications",
  "AdminRegistrations",
  "SupervisorAttendanceDetail",
  "MemberProgress",
  "MemberDashboardScreen",
  "SupervisorDashboard",
  "AdminDashboard",
  "AdminSeasons",
  "MemberProfile",
  "SupervisorProfile",
  "AdminProfile",
]);

/**
 * Accueils / inbox : pas une destination métier.
 * Un tap vers l'un d'eux ouvre NotificationDetail (repli).
 */
const NOT_A_DESTINATION = new Set([
  "NotificationInbox",
  "NotificationDetail",
  "MemberDashboardScreen",
  "SupervisorDashboard",
  "AdminDashboard",
]);

/**
 * Destinations métier par event_type.
 * Tout event_type absent ici (et sans payload.screen dédié) → NotificationDetail.
 */
const SCREEN_BY_EVENT = {
  presence_rappel: "SupervisorAttendanceDetail",
};

function resolvePayload(source) {
  if (!source || typeof source !== "object") return {};
  if (source.payload && typeof source.payload === "object") {
    return {
      ...source.payload,
      event_type: source.payload.event_type || source.eventType || "",
    };
  }
  return source;
}

function dedicatedScreenFor(payload) {
  const eventType = String(payload.event_type || "").trim();
  const screen =
    String(payload.screen || "").trim() || SCREEN_BY_EVENT[eventType] || "";
  if (!screen || !ALLOWED_SCREENS.has(screen) || NOT_A_DESTINATION.has(screen)) {
    return "";
  }
  return screen;
}

function detailParams(payload) {
  return {
    title: payload.title || "",
    body: payload.body || "",
    createdAt: payload.createdAt || payload.created_at || null,
    category: payload.category || null,
  };
}

/**
 * Navigation depuis le payload d'une notification (tap push ou inbox).
 * Destination métier si connue ; sinon NotificationDetail (repli automatique).
 */
export function navigateFromNotificationPayload(navigation, payload) {
  if (!navigation || !payload || typeof payload !== "object") {
    return false;
  }
  const dedicated = dedicatedScreenFor(payload);
  try {
    if (dedicated) {
      const params =
        payload.params && typeof payload.params === "object" ? payload.params : {};
      navigation.navigate(dedicated, params);
      return true;
    }
    navigation.navigate("NotificationDetail", detailParams(payload));
    return true;
  } catch (e) {
    console.warn("[notif] navigate:", e?.message || e);
    if (dedicated) {
      try {
        navigation.navigate("NotificationDetail", detailParams(payload));
        return true;
      } catch (e2) {
        console.warn("[notif] navigate detail:", e2?.message || e2);
      }
    }
    return false;
  }
}

/**
 * Chemin unique inbox + tap push : read_at d'abord, puis navigation.
 * Si la cible n'existe pas / la nav échoue, read_at est déjà posé.
 * Si read_at échoue (réseau), on navigue quand même.
 */
export async function openNotification(navigation, source = {}) {
  const payload = resolvePayload(source);
  const id = source.id || payload.notificationId || null;

  let marked = false;
  if (id) {
    const res = await markNotificationRead(id);
    marked = !!res?.ok;
    if (!marked && res?.error) {
      console.warn("[notif] mark read:", res.error);
    }
  }

  const navigated = navigateFromNotificationPayload(navigation, {
    ...payload,
    title: source.title || payload.title || "",
    body: source.body || payload.body || "",
    createdAt: source.createdAt || payload.createdAt || payload.created_at || null,
    category: source.category || payload.category || null,
  });
  return { marked, navigated };
}
