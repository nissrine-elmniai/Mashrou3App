import { useEffect, useRef } from "react";
import { useApp } from "../context/AppContext";
import { subscribeNotificationResponses } from "../lib/pushNotifications";
import {
  navigationHasScreen,
  openNotification,
} from "../lib/notificationNavigation";

function hasNavigablePayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  return Boolean(
    payload.notificationId ||
      payload.id ||
      String(payload.title || "").trim() ||
      String(payload.body || "").trim() ||
      String(payload.event_type || payload.eventType || "").trim() ||
      String(payload.screen || "").trim()
  );
}

/**
 * Relie le tap d'une push Expo à read_at + navigation (même chemin que l'inbox).
 * Attend JWT + stack de rôle (NotificationDetail n'existe pas sur Auth).
 */
export default function PushNotificationBridge({ navigationRef, navTick = 0 }) {
  const { supabaseSession, currentUser } = useApp();
  const authId = supabaseSession?.user?.id || null;
  const signedIn = Boolean(currentUser?.role);
  const authIdRef = useRef(authId);
  const signedInRef = useRef(signedIn);
  const pendingRef = useRef(null);
  const flushingRef = useRef(false);
  authIdRef.current = authId;
  signedInRef.current = signedIn;

  const flush = async () => {
    if (flushingRef.current) return;
    const payload = pendingRef.current;
    if (!payload) return;
    if (!hasNavigablePayload(payload)) {
      pendingRef.current = null;
      return;
    }
    const nav = navigationRef?.current;
    if (
      !authIdRef.current ||
      !signedInRef.current ||
      !nav ||
      typeof nav.navigate !== "function"
    ) {
      return;
    }
    if (!navigationHasScreen(nav, "NotificationDetail")) {
      return;
    }

    flushingRef.current = true;
    try {
      const res = await openNotification(nav, {
        id: payload.notificationId,
        payload,
      });
      if (res?.navigated) {
        pendingRef.current = null;
      }
    } finally {
      flushingRef.current = false;
    }
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
        if (pendingRef.current && attempt < 80) {
          attempt += 1;
          setTimeout(tick, 250);
        }
      };
      setTimeout(tick, 250);
    });
  }, [navigationRef]);

  useEffect(() => {
    flush();
  }, [authId, signedIn, navTick]);

  return null;
}
