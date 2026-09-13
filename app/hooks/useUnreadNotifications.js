import { useCallback, useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import {
  countUnreadNotifications,
  subscribeMyNotifications,
} from "../lib/notificationsApi";

/** Compteur non lus (hors alertes admin) + Realtime. 0 si pas de session. */
export function useUnreadNotifications() {
  const { supabaseSession } = useApp();
  const userId = supabaseSession?.user?.id || null;
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    const res = await countUnreadNotifications();
    if (res.ok) setCount(res.count || 0);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return undefined;
    }
    refresh();
    return subscribeMyNotifications(() => {
      refresh();
    });
  }, [userId, refresh]);

  return { count, refresh };
}
