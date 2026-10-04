import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./AppContext";
import {
  countUnreadNotifications,
  subscribeMyNotifications,
} from "../lib/notificationsApi";

export const UnreadNotificationsContext = createContext(null);

/** Un seul fetch + un seul canal Realtime pour tous les rôles. */
export function UnreadNotificationsProvider({ children }) {
  const { supabaseSession } = useApp();
  const userId = supabaseSession?.user?.id || null;
  const userIdRef = useRef(userId);
  const [count, setCount] = useState(0);

  useEffect(() => { userIdRef.current = userId; }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    const res = await countUnreadNotifications();
    if (userIdRef.current !== userId) return;
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

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);

  return (
    <UnreadNotificationsContext.Provider value={value}>
      {children}
    </UnreadNotificationsContext.Provider>
  );
}
