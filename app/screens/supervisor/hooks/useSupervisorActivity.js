import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { isSupabaseConfigured } from "../../../lib/supabase";
import {
  fetchSeanceProgressActivity,
  fetchSeancePresenceActivity,
  fetchSeanceInscriptionActivity,
} from "../../../lib/supervisorActivityApi";
import { ROLES } from "../../../constants/roles";
import { normalizeAppRole } from "../../../lib/auth";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 5;

function parseActivityAt(raw) {
  if (!raw) return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return 0;
  const t = new Date(s.includes("T") || s.includes(" ") ? s : s.replace(/\//g, "-")).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function isWithinWindow(atMs) {
  if (!atMs) return false;
  const now = Date.now();
  return atMs <= now + 24 * 60 * 60 * 1000 && atMs >= now - WINDOW_MS;
}

function memberDisplayName(membersById, membreId) {
  const m = membersById.get(membreId);
  if (!m) return "عضو";
  const name = `${m.user?.firstName || ""} ${m.user?.lastName || ""}`.trim();
  return name || "عضو";
}

/** f / female / انثى / أنثى → verbe au féminin (سجّلت، انضمّت). */
function memberIsFemale(membersById, membreId) {
  const m = membersById.get(membreId);
  const raw = String(m?.user?.gender || m?.genre || "").trim();
  if (!raw) return false;
  const key = raw.toLowerCase();
  return (
    key === "f" ||
    key === "female" ||
    key === "femme" ||
    raw === "أنثى" ||
    raw === "انثى"
  );
}

/**
 * Fil d'activité de la séance active (7 jours, 6 items).
 * Messages : threads déjà chargés par useInboxThreads — pas de second fetch.
 */
export function useSupervisorActivity({
  seanceId = null,
  members = [],
  threads = [],
  enabled = true,
}) {
  const usingSupabase = enabled && isSupabaseConfigured() && !!seanceId;
  const [fetched, setFetched] = useState({
    progress: [],
    presence: [],
    inscriptions: [],
  });

  const memberIds = useMemo(
    () => (members || []).map((m) => m.user?.id).filter(Boolean),
    [members]
  );

  const membersById = useMemo(() => {
    const map = new Map();
    (members || []).forEach((m) => {
      if (m.user?.id) map.set(m.user.id, m);
    });
    return map;
  }, [members]);

  const memberIdSet = useMemo(() => new Set(memberIds), [memberIds]);

  const loadFetched = useCallback(async () => {
    if (!usingSupabase) {
      setFetched({ progress: [], presence: [], inscriptions: [] });
      return;
    }

    const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
    const [progressRes, presenceRes, inscriptionRes] = await Promise.all([
      fetchSeanceProgressActivity(memberIds, sinceIso),
      fetchSeancePresenceActivity(seanceId, sinceIso),
      fetchSeanceInscriptionActivity(seanceId, sinceIso),
    ]);

    if (!progressRes.ok) {
      console.warn("useSupervisorActivity: progression —", progressRes.error);
    }
    if (!presenceRes.ok) {
      console.warn("useSupervisorActivity: presences —", presenceRes.error);
    }
    if (!inscriptionRes.ok) {
      console.warn("useSupervisorActivity: inscriptions —", inscriptionRes.error);
    }

    setFetched({
      progress: progressRes.ok ? progressRes.rows : [],
      presence: presenceRes.ok ? presenceRes.rows : [],
      inscriptions: inscriptionRes.ok ? inscriptionRes.rows : [],
    });
  }, [usingSupabase, seanceId, memberIds]);

  useEffect(() => {
    loadFetched();
  }, [loadFetched]);

  useFocusEffect(
    useCallback(() => {
      loadFetched();
    }, [loadFetched])
  );

  const activities = useMemo(() => {
    if (!usingSupabase) return [];

    const items = [];

    fetched.progress.forEach((row) => {
      const atMs = parseActivityAt(row.at);
      if (!isWithinWindow(atMs) || !memberIdSet.has(row.membreId)) return;
      const name = memberDisplayName(membersById, row.membreId);
      const verb = memberIsFemale(membersById, row.membreId) ? "سجّلت" : "سجّل";
      items.push({
        id: `progress-${row.id || row.membreId}-${atMs}`,
        type: "progress",
        at: new Date(atMs).toISOString(),
        atMs,
        title: `${verb} ${name} تقدّمًا`,
        icon: "book-outline",
      });
    });

    fetched.presence.forEach((row) => {
      const atMs = parseActivityAt(row.at);
      if (!isWithinWindow(atMs)) return;
      items.push({
        id: `presence-${row.seanceId}-${row.date}`,
        type: "presence",
        at: new Date(atMs).toISOString(),
        atMs,
        title: "تم تسجيل الحضور",
        icon: "checkbox-outline",
      });
    });

    fetched.inscriptions.forEach((row) => {
      const atMs = parseActivityAt(row.at);
      if (!isWithinWindow(atMs) || !memberIdSet.has(row.membreId)) return;
      const name = memberDisplayName(membersById, row.membreId);
      const verb = memberIsFemale(membersById, row.membreId) ? "انضمّت" : "انضم";
      items.push({
        id: `inscription-${row.id || row.membreId}`,
        type: "inscription",
        at: new Date(atMs).toISOString(),
        atMs,
        title: `${verb} ${name} إلى الحصة`,
        icon: "person-add-outline",
      });
    });

    (threads || []).forEach((t) => {
      const threadRole = normalizeAppRole(t.role);
      if (threadRole === ROLES.ADMIN || threadRole === ROLES.SUPERVISOR) return;
      if (!t.incoming) return;
      if (!memberIdSet.has(t.otherId)) return;
      const atMs = parseActivityAt(t.lastAt);
      if (!isWithinWindow(atMs)) return;
      const name =
        `${t.firstName || ""} ${t.lastName || ""}`.trim() ||
        memberDisplayName(membersById, t.otherId);
      items.push({
        id: `message-${t.otherId}-${atMs}`,
        type: "message",
        at: new Date(atMs).toISOString(),
        atMs,
        title: `رسالة جديدة من ${name}`,
        icon: "chatbubble-ellipses-outline",
      });
    });

    return items.sort((a, b) => b.atMs - a.atMs).slice(0, MAX_ITEMS);
  }, [usingSupabase, fetched, threads, memberIdSet, membersById]);

  return {
    activities,
    dataSource: usingSupabase ? "supabase" : "mock",
  };
}
