import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getInboxThreads, subscribeMyMessages } from "../lib/messagesApi";

/**
 * Conversations du compte connecté, rechargées à chaque focus d'écran
 * et à chaque nouveau message Realtime.
 * includeStatus est réservé à l'admin : il ne change pas le select
 * des inbox superviseur et membre.
 * error est renseigné si le chargement échoue ; les fils déjà connus
 * ne sont pas effacés, pour ne pas transformer un échec en liste vide.
 * @param {boolean} [enabled]
 * @param {{ includeStatus?: boolean }} [options]
 */
export function useInboxThreads(enabled = true, options = {}) {
  const includeStatus = options?.includeStatus === true;
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const res = await getInboxThreads({ includeStatus });
    if (res.ok) {
      setThreads(res.threads);
      setError(null);
    } else {
      setError(res.error || "تعذر تحميل المحادثات");
    }
    setLoading(false);
  }, [includeStatus]);

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

  return { threads, loading, reload, error };
}
