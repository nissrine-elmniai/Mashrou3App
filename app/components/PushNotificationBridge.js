import { useEffect } from "react";
import { subscribeNotificationResponses } from "../lib/pushNotifications";
import { navigateFromNotificationPayload } from "../lib/notificationNavigation";

/**
 * Relie le tap d'une push Expo à la navigation (payload.screen).
 * Hors du Stack pour ne pas démonter l'écouteur à chaque écran.
 */
export default function PushNotificationBridge({ navigationRef }) {
  useEffect(() => {
    return subscribeNotificationResponses((payload) => {
      const tryNav = (attempt = 0) => {
        const nav = navigationRef?.current;
        if (nav && typeof nav.navigate === "function") {
          navigateFromNotificationPayload(nav, payload);
          return;
        }
        if (attempt < 20) {
          setTimeout(() => tryNav(attempt + 1), 250);
        }
      };
      tryNav();
    });
  }, [navigationRef]);

  return null;
}
