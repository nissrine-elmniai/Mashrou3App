import { useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { subscribeNotificationResponses } from "../lib/pushNotifications";
import { openNotification } from "../lib/notificationNavigation";

/**
 * Relie le tap d'une push Expo à read_at + navigation (même chemin que l'inbox).
 * Attend la session auth : au démarrage à froid, le JWT n'est pas encore là.
 */
export default function PushNotificationBridge({ navigationRef }) {
  const { supabaseSession } = useApp();
  const authId = supabaseSession?.user?.id || null;
  const authIdRef = useRef(authId);
  const pendingRef = useRef(null);
  authIdRef.current = authId;

  const flush = () => {
    const payload = pendingRef.current;
    if (!payload) return;
    const nav = navigationRef?.current;
    if (!authIdRef.current || !nav || typeof nav.navigate !== "function") {
      return;
    }
    pendingRef.current = null;
    openNotification(nav, {
      id: payload.notificationId,
      payload,
    });
  };

  useEffect(() => {
    return subscribeNotificationResponses((payload) => {
      pendingRef.current =
        payload && typeof payload === "object" ? payload : {};
      flush();
      if (!pendingRef.current) return;
      let attempt = 0;
      const tick = () => {
        if (!pendingRef.current) return;
        flush();
        if (pendingRef.current && attempt < 40) {
          attempt += 1;
          setTimeout(tick, 250);
        }
      };
      setTimeout(tick, 250);
    });
  }, [navigationRef]);

  useEffect(() => {
    flush();
  }, [authId]);

  return null;
}
