import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Verrou contre le double appui (connexion lente).
 * `run(fn)` ignore l'appel si une exécution est en cours. Le verrou est un
 * useRef : il est posé avant le prochain rendu, donc deux appuis dans la même
 * image ne passent pas. `busy` (état React) sert seulement à l'affichage.
 * @returns {{ busy: boolean, run: (fn: () => Promise<any>|any) => Promise<any> }}
 */
export function useSubmitLock() {
  const lockRef = useRef(false);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (fn) => {
    if (lockRef.current) return undefined;
    lockRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      lockRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, []);

  return { busy, run };
}
