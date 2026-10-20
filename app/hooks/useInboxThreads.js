import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { subscribeMyMessages } from "../lib/messagesApi";
import { cachedInboxThreads } from "../lib/messagingOfflineReads";
import { unknownDataMessage } from "../lib/offlineCache";
import { useOfflineReload } from "./useOfflineReload";

/**
 * Conversations du compte connecté, rechargées à chaque focus d'écran
 * et à chaque nouveau message Realtime.
 * includeStatus est réservé à l'admin : il ne change pas le select
 * des inbox superviseur et membre.
 * error est renseigné si le chargement échoue ; les fils déjà connus
 * ne sont pas effacés, pour ne pas transformer un échec en liste vide.
 * Hors ligne : derniers fils en cache (50 au plus) ; sans cache, error vaut
 * « غير متاح دون اتصال ». Rechargés au retour du réseau si l'écran est affiché
 * (sinon au prochain focus).
 * @param {boolean} [enabled]
 * @param {{ includeStatus?: boolean }} [options]
 */
export function useInboxThreads(enabled = true, options = {}) {
  const includeStatus = options?.includeStatus === true;
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  /** Fils jamais lus, faute de réseau (hors ligne, sans cache). */
  const [unknown, setUnknown] = useState(false);
  const reloadRef = useRef(null);
  const markOffline = useOfflineReload(() => reloadRef.current?.());

  const reload = useCallback(async () => {
    const res = await cachedInboxThreads({ includeStatus });
    markOffline(res);
    if (res.ok) {
      setThreads(res.threads || []);
      setError(null);
      setUnknown(false);
    } else {
      setError(unknownDataMessage(res, "تعذر تحميل المحادثات"));
      if (res.offline) setUnknown(true);
    }
    setLoading(false);
  }, [includeStatus, markOffline]);
  reloadRef.current = enabled ? reload : null;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false);
        return undefined;
      }
      setLoading(true);
      reload();
      return subscribeMyMessages(() => {
        reload();
      });
    }, [enabled, reload])
  );

  return { threads, loading, reload, error, unknown };
}
