import { useCallback, useEffect, useRef } from "react";
import { useIsFocused } from "@react-navigation/native";
import { onBackOnline } from "../lib/networkState";
import { servedOffline } from "../lib/offlineCache";

/**
 * Rechargement au retour du réseau, pour un écran qui a servi des données du
 * cache (ou des données inconnues faute de réseau). Un seul abonnement,
 * retiré au démontage.
 *
 * - Écran au premier plan : `onReconnect()` immédiatement.
 * - Écran en arrière-plan : rien maintenant, ses chargements au focus
 *   s'en chargent ; `onDeferredFocus()` (facultatif) recharge au prochain focus
 *   ce qui n'est PAS rechargé au focus. Pas de double requête.
 *
 * @returns {(...results: object[]) => void} à appeler avec les résultats de cachedFetch
 */
export function useOfflineReload(onReconnect, onDeferredFocus = null) {
  const isFocused = useIsFocused();
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;
  const staleRef = useRef(false);
  const deferredRef = useRef(false);
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;
  const deferredFocusRef = useRef(onDeferredFocus);
  deferredFocusRef.current = onDeferredFocus;

  useEffect(
    () =>
      onBackOnline(() => {
        if (!staleRef.current) return;
        staleRef.current = false;
        if (focusedRef.current) {
          reconnectRef.current?.();
        } else if (deferredFocusRef.current) {
          deferredRef.current = true;
        }
      }),
    []
  );

  useEffect(() => {
    if (!isFocused || !deferredRef.current) return;
    deferredRef.current = false;
    deferredFocusRef.current?.();
  }, [isFocused]);

  return useCallback((...results) => {
    if (results.some(servedOffline)) staleRef.current = true;
  }, []);
}
