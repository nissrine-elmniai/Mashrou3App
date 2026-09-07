import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  getMyChatGroups,
  subscribeMyGroupMessages,
} from "../lib/chatGroupsApi";

/**
 * Groupes du compte connecté, rechargés à chaque focus d'écran
 * et à chaque nouveau message de groupe Realtime.
 */
export function useChatGroups(enabled = true) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const res = await getMyChatGroups();
    if (res.ok) setGroups(res.groups || []);
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
      return subscribeMyGroupMessages(() => {
        reload();
      });
    }, [enabled, reload])
  );

  const totalUnread = useMemo(
    () => (groups || []).reduce((sum, g) => sum + (Number(g.unreadCount) || 0), 0),
    [groups]
  );

  return { groups, loading, reload, totalUnread };
}
