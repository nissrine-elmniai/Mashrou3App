import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getInboxThreads, subscribeMyMessages } from "../lib/messagesApi";

/**
 * Conversations du compte connecté, rechargées à chaque focus d'écran
 * et à chaque nouveau message Realtime.
 */
export function useInboxThreads(enabled = true) {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const res = await getInboxThreads();
    if (res.ok) setThreads(res.threads);
    setLoading(false);
  }, []);

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

  return { threads, loading, reload };
}
