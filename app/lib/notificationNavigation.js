/** Écrans autorisés pour la navigation au tap (payload.screen). */
const ALLOWED_SCREENS = new Set([
  "NotificationInbox",
  "NotificationSettings",
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

/** Repli si payload.screen absent (lots métier). */
const SCREEN_BY_EVENT = {
  presence_rappel: "SupervisorAttendanceDetail",
  presence_absence: "MemberDashboardScreen",
};

/**
 * Navigation depuis le payload d'une notification (tap push ou inbox).
 * payload.screen + payload.params optionnels.
 * presence_rappel → SupervisorAttendanceDetail (marquage).
 * presence_absence → MemberDashboardScreen (pas d'écran détail présence membre).
 */
export function navigateFromNotificationPayload(navigation, payload) {
  if (!navigation || !payload || typeof payload !== "object") {
    return false;
  }
  const eventType = String(payload.event_type || "").trim();
  const screen =
    String(payload.screen || "").trim() || SCREEN_BY_EVENT[eventType] || "";
  if (!screen || !ALLOWED_SCREENS.has(screen)) {
    if (typeof navigation.navigate === "function") {
      navigation.navigate("NotificationInbox");
      return true;
    }
    return false;
  }
  const params =
    payload.params && typeof payload.params === "object" ? payload.params : {};
  try {
    navigation.navigate(screen, params);
    return true;
  } catch (e) {
    console.warn("[notif] navigate:", e?.message || e);
    return false;
  }
}
