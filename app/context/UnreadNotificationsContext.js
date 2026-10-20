import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./AppContext";
import { subscribeMyNotifications } from "../lib/notificationsApi";
import { cachedUnreadNotificationsCount } from "../lib/messagingOfflineReads";
import { servedOffline } from "../lib/offlineCache";
import { onBackOnline } from "../lib/networkState";

export const UnreadNotificationsContext = createContext(null);

/** Un seul fetch + un seul canal Realtime pour tous les rôles. */
export function UnreadNotificationsProvider({ children }) {
  const { supabaseSession, currentUser, offlineRestored } = useApp();
  const sessionUserId = supabaseSession?.user?.id || null;
  // Restauration hors ligne : pas de session Supabase, id du compte restauré.
  const userId =
    sessionUserId || (offlineRestored ? currentUser?.authId || null : null);
  const userIdRef = useRef(userId);
  const [count, setCount] = useState(0);
  /** Compte servi du cache (ou inconnu) : relu au retour du réseau. */
  const staleRef = useRef(false);

  useEffect(() => { userIdRef.current = userId; }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setCount(0);
      return;
    }
    const res = await cachedUnreadNotificationsCount();
    if (userIdRef.current !== userId) return;
    if (servedOffline(res)) staleRef.current = true;
    // Échec : dernière valeur gardée (jamais 0 par défaut).
    if (res.ok) setCount(res.count || 0);
  }, [userId]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(
    () =>
      onBackOnline(() => {
        if (!staleRef.current) return;
        staleRef.current = false;
        refreshRef.current?.();
      }),
    []
  );

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    refresh();
  }, [userId, refresh]);

  // Realtime : seulement avec une session Supabase (comme avant).
  useEffect(() => {
    if (!sessionUserId) return undefined;
    return subscribeMyNotifications(() => {
      refreshRef.current?.();
    });
  }, [sessionUserId]);

  const value = useMemo(() => ({ count, refresh }), [count, refresh]);

  return (
    <UnreadNotificationsContext.Provider value={value}>
      {children}
    </UnreadNotificationsContext.Provider>
  );
}
