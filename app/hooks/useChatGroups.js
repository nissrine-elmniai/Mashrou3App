import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { subscribeMyGroupMessages } from "../lib/chatGroupsApi";
import { cachedChatGroups } from "../lib/messagingOfflineReads";
import { useOfflineReload } from "./useOfflineReload";

/**
 * Groupes du compte connecté, rechargés à chaque focus d'écran
 * et à chaque nouveau message de groupe Realtime.
 * Hors ligne : derniers groupes en cache (badges compris) ; un échec ne vide
 * pas la liste. unknown : jamais lus, faute de réseau.
 */
export function useChatGroups(enabled = true) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unknown, setUnknown] = useState(false);
  const reloadRef = useRef(null);
  const markOffline = useOfflineReload(() => reloadRef.current?.());

  const reload = useCallback(async () => {
    const res = await cachedChatGroups();
    markOffline(res);
    if (res.ok) {
      setGroups(res.groups || []);
      setUnknown(false);
    } else if (res.offline) {
      setUnknown(true);
    }
    setLoading(false);
  }, [markOffline]);
  reloadRef.current = enabled ? reload : null;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false);
        return undefined;
      }
      setLoading(true);
      reload();
      return subscribeMyGroupMessages(() => {
        reload();
      });
    }, [enabled, reload])
  );

  const totalUnread = useMemo(
    () => (groups || []).reduce((sum, g) => sum + (Number(g.unreadCount) || 0), 0),
    [groups]
  );

  return { groups, loading, reload, totalUnread, unknown };
}
