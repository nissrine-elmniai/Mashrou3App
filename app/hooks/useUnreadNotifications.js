import { useContext } from "react";
import { UnreadNotificationsContext } from "../context/UnreadNotificationsContext";

/** Compteur non lus (hors alertes admin) + Realtime. 0 si pas de session. */
export function useUnreadNotifications() {
  const value = useContext(UnreadNotificationsContext);
  if (!value) {
    throw new Error(
      "useUnreadNotifications must be used within UnreadNotificationsProvider"
    );
  }
  return value;
}
