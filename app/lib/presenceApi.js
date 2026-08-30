import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import {
  getLatestSeanceOccurrence,
  getSeanceOccurrencesBetween,
  isOccurrenceMarkingWindowOpen,
  getOccurrenceWindowEnd,
} from "../screens/supervisor/supervisorHelpers";

const SUPABASE_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} — انتهت المهلة (${Math.round(ms / 1000)}ث)`)),
        ms
      );
    }),
  ]);
}

function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/column.*does not exist/i.test(msg)) {
    return `عمود مفقود في ${tableLabel}`;
  }
  return mapSupabaseAuthError(error);
}

function isTableMissingError(error) {
  const msg = error?.message || "";
  return /relation.*does not exist|Could not find the table/i.test(msg);
}

/** Normalise statut depuis la colonne presences.statut ('present' | 'absent'). */
function normalizePresenceStatus(row) {
  if (row == null) return "unset";
  const raw = String(row.statut ?? "").toLowerCase();
  if (raw === "present") return "present";
  if (raw === "absent") return "absent";
  return "unset";
}

function extractPresenceDate(row) {
  if (row?.date) {
    return String(row.date).slice(0, 10).replace(/-/g, "/");
  }
  if (row?.created_at) {
    return String(row.created_at).slice(0, 10).replace(/-/g, "/");
  }
  return null;
}

/**
 * Historique de présence d'un membre (table presences si elle existe en base).
 * Taux = présent / total des séances marquées (present ou absent).
 * @returns {{ ok, hasData?, records?, rate?, tableMissing?, error? }}
 */
export async function getMemberPresenceSummary(membreId, seanceId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!membreId) {
    return { ok: false, error: "معرّف العضو مفقود" };
  }

  try {
    let query = supabase
      .from("presences")
      .select("membre_id, seance_id, date, statut, created_at")
      .eq("membre_id", membreId);
    if (seanceId) {
      query = query.eq("seance_id", seanceId);
    }

    let data;
    let error;
    const ordered = await withTimeout(
      query.order("date", { ascending: false }).limit(20),
      SUPABASE_TIMEOUT_MS,
      "قراءة حضور العضو"
    );
    data = ordered.data;
    error = ordered.error;

    if (error && /column.*does not exist/i.test(error?.message || "")) {
      let fbQuery = supabase
        .from("presences")
        .select("membre_id, seance_id, date, statut, created_at")
        .eq("membre_id", membreId);
      if (seanceId) {
        fbQuery = fbQuery.eq("seance_id", seanceId);
      }
      const fallback = await withTimeout(
        fbQuery.order("created_at", { ascending: false }).limit(20),
        SUPABASE_TIMEOUT_MS,
        "قراءة حضور العضو"
      );
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      if (isTableMissingError(error)) {
        return { ok: true, hasData: false, records: [], rate: null, tableMissing: true };
      }
      return { ok: false, error: mapTableError(error, "presences") };
    }

    const records = (data || [])
      .map((row) => ({
        date: extractPresenceDate(row),
        status: normalizePresenceStatus(row),
      }))
      .filter((r) => r.status === "present" || r.status === "absent");

    const marked = records;
    const rate =
      marked.length > 0
        ? Math.round(
            (marked.filter((r) => r.status === "present").length / marked.length) * 100
          )
        : null;

    return {
      ok: true,
      hasData: marked.length > 0,
      records: marked.slice(0, 5),
      rate,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Présence batch pour une séance à une date de séance précise (modèle hebdomadaire).
 * @returns {{ ok, byMemberId?: Record<string, 'present'|'absent'|'unset'>, degraded?, error? }}
 */
export async function getSeancePresenceForDate(seanceId, sessionDateIso, memberIds = []) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", byMemberId: {} };
  }
  if (!seanceId || !sessionDateIso) {
    return { ok: true, byMemberId: {} };
  }

  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true, byMemberId: {} };
  }

  const dbDate = String(sessionDateIso).slice(0, 10).replace(/\//g, "-");

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("presences")
        .select("membre_id, statut")
        .eq("seance_id", seanceId)
        .eq("date", dbDate)
        .in("membre_id", ids),
      SUPABASE_TIMEOUT_MS,
      "قراءة حضور الحصة"
    );

    if (error) {
      console.warn("[presenceApi] getSeancePresenceForDate", error);
      const msg = error?.message || "";
      if (
        isTableMissingError(error) ||
        /permission|row-level security|RLS|42501|violates row/i.test(msg)
      ) {
        return { ok: true, byMemberId: {}, degraded: true };
      }
      return { ok: false, error: mapTableError(error, "presences"), byMemberId: {} };
    }

    const byMemberId = {};
    for (const id of ids) {
      byMemberId[id] = "unset";
    }
    for (const row of data || []) {
      const status = normalizePresenceStatus(row);
      if (status === "present" || status === "absent") {
        byMemberId[row.membre_id] = status;
      }
    }

    return { ok: true, byMemberId };
  } catch (e) {
    console.warn("[presenceApi] getSeancePresenceForDate", e);
    return { ok: true, byMemberId: {}, degraded: true };
  }
}

function dbDateToSlash(dbDate) {
  return String(dbDate).slice(0, 10).replace(/-/g, "/");
}

function slashDateToDb(sessionDateIso) {
  return String(sessionDateIso).slice(0, 10).replace(/\//g, "-");
}

/**
 * Présences brutes pour une séance sur une plage de dates (inclus).
 * @returns {{ ok, byDate?: Record<string, Record<string, 'present'|'absent'>>, error? }}
 */
export async function getSeancePresenceForDateRange(
  seanceId,
  memberIds = [],
  fromDate,
  toDate
) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", byDate: {} };
  }
  if (!seanceId || !fromDate || !toDate) {
    return { ok: true, byDate: {} };
  }

  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true, byDate: {} };
  }

  const fromDb = slashDateToDb(fromDate);
  const toDb = slashDateToDb(toDate);

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("presences")
        .select("membre_id, date, statut")
        .eq("seance_id", seanceId)
        .gte("date", fromDb)
        .lte("date", toDb)
        .in("membre_id", ids),
      SUPABASE_TIMEOUT_MS,
      "قراءة حضور الحصة"
    );

    if (error) {
      console.warn("[presenceApi] getSeancePresenceForDateRange", error);
      const msg = error?.message || "";
      if (
        isTableMissingError(error) ||
        /permission|row-level security|RLS|42501|violates row/i.test(msg)
      ) {
        return { ok: true, byDate: {}, degraded: true };
      }
      return { ok: false, error: mapTableError(error, "presences"), byDate: {} };
    }

    const byDate = {};
    for (const row of data || []) {
      const status = normalizePresenceStatus(row);
      if (status !== "present" && status !== "absent") continue;
      const dateSlash = dbDateToSlash(row.date);
      if (!byDate[dateSlash]) byDate[dateSlash] = {};
      byDate[dateSlash][row.membre_id] = status;
    }

    return { ok: true, byDate };
  } catch (e) {
    console.warn("[presenceApi] getSeancePresenceForDateRange", e);
    return { ok: true, byDate: {}, degraded: true };
  }
}

function countPresenceStats(byMemberId = {}, memberIds = []) {
  let presentCount = 0;
  let absentCount = 0;
  for (const id of memberIds) {
    const status = byMemberId[id];
    if (status === "present") presentCount += 1;
    else if (status === "absent") absentCount += 1;
  }
  const markedTotal = presentCount + absentCount;
  const pct =
    memberIds.length > 0
      ? Math.round((presentCount / memberIds.length) * 100)
      : 0;
  return { presentCount, absentCount, pct, markedTotal };
}

/**
 * Historique agrégé par occurrence de séance (depuis date_debut saison).
 * getLatestSeanceOccurrenceStatus reste inchangé pour les pastilles / occurrence courante.
 */
export async function buildSeanceAttendanceHistory(
  seanceId,
  jour,
  heureDebut,
  saisonDateDebut,
  memberIds = [],
  refDate = new Date()
) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId || !jour) {
    return { ok: false, error: "معرّف الحصة أو اليوم مفقود" };
  }
  if (!saisonDateDebut) {
    return { ok: false, error: "تاريخ بداية الموسم غير متوفر — تعذر عرض سجل الحضور" };
  }

  const ids = [...new Set((memberIds || []).filter(Boolean))];
  const occurrences = getSeanceOccurrencesBetween(jour, saisonDateDebut, refDate, refDate);

  if (occurrences.length === 0) {
    return { ok: true, rows: [], markingContext: null };
  }

  const oldest = occurrences[occurrences.length - 1];
  const newest = occurrences[0];
  const presRes = await getSeancePresenceForDateRange(seanceId, ids, oldest, newest);

  if (!presRes.ok) {
    return { ok: false, error: presRes.error, rows: [] };
  }
  if (presRes.degraded) {
    return {
      ok: false,
      error: "تعذر قراءة سجل الحضور من قاعدة البيانات",
      rows: [],
    };
  }

  const byDate = presRes.byDate || {};
  const rows = occurrences.map((sessionDate) => {
    const dateMap = byDate[sessionDate] || {};
    const isMarked = ids.some((id) => {
      const s = dateMap[id];
      return s === "present" || s === "absent";
    });
    const windowOpen = isOccurrenceMarkingWindowOpen(sessionDate, heureDebut, refDate);
    const markingWindowEnd = getOccurrenceWindowEnd(sessionDate, heureDebut);
    const { presentCount, absentCount, pct } = countPresenceStats(dateMap, ids);

    return {
      sessionDate,
      presentCount,
      absentCount,
      pct,
      isMarked,
      windowOpen,
      markingWindowEnd,
    };
  });

  const openRow = rows.find((r) => r.windowOpen) || null;
  let markingContext = null;
  if (openRow) {
    const dateMap = byDate[openRow.sessionDate] || {};
    const byMemberId = {};
    for (const id of ids) {
      const s = dateMap[id];
      byMemberId[id] = s === "present" || s === "absent" ? s : "unset";
    }
    markingContext = {
      sessionDate: openRow.sessionDate,
      isMarked: openRow.isMarked,
      markingWindowEnd: openRow.markingWindowEnd,
      byMemberId,
    };
  }

  return { ok: true, rows, markingContext };
}

/**
 * Enregistre ou met à jour la présence d'une séance pour une date (upsert UNIQUE membre_id, seance_id, date).
 * @param {string} seanceId
 * @param {string} sessionDateIso YYYY/MM/DD ou YYYY-MM-DD
 * @param {Record<string, 'present'|'absent'>} records
 * @returns {{ ok: boolean, error?: string }}
 */
export async function saveSeancePresence(seanceId, sessionDateIso, records = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId || !sessionDateIso) {
    return { ok: false, error: "معرّف الحصة أو التاريخ مفقود" };
  }

  const dbDate = String(sessionDateIso).slice(0, 10).replace(/\//g, "-");
  const rows = Object.entries(records)
    .filter(([membreId, status]) => membreId && (status === "present" || status === "absent"))
    .map(([membreId, status]) => ({
      membre_id: membreId,
      seance_id: seanceId,
      date: dbDate,
      statut: status,
    }));

  if (rows.length === 0) {
    return { ok: false, error: "لا توجد بيانات للحفظ" };
  }

  try {
    const { error } = await withTimeout(
      supabase.from("presences").upsert(rows, {
        onConflict: "membre_id,seance_id,date",
      }),
      SUPABASE_TIMEOUT_MS,
      "حفظ حضور الحصة"
    );

    if (error) {
      console.warn("[presenceApi] saveSeancePresence", error);
      return { ok: false, error: mapTableError(error, "presences") };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Détermine le mode d'affichage (marquage vs historique) pour la dernière occurrence de séance.
 * @returns {{
 *   ok: boolean,
 *   mode?: 'marking' | 'historical',
 *   sessionDate?: string|null,
 *   isMarked?: boolean,
 *   withinMarkingWindow?: boolean,
 *   markingWindowEnd?: string|null,
 *   byMemberId?: Record<string, 'present'|'absent'|'unset'>,
 *   error?: string
 * }}
 */
export async function getLatestSeanceOccurrenceStatus(
  seanceId,
  jourText,
  heureDebut = null,
  memberIds = []
) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }

  const occurrence = getLatestSeanceOccurrence(jourText, new Date(), heureDebut);
  if (!occurrence.sessionDate) {
    return {
      ok: true,
      mode: "historical",
      sessionDate: null,
      isMarked: false,
      withinMarkingWindow: false,
      markingWindowEnd: null,
      byMemberId: {},
    };
  }

  const ids = [...new Set((memberIds || []).filter(Boolean))];
  const presRes = await getSeancePresenceForDate(seanceId, occurrence.sessionDate, ids);

  if (!presRes.ok) {
    return { ok: false, error: presRes.error, byMemberId: presRes.byMemberId || {} };
  }

  const byMemberId = presRes.byMemberId || {};
  const isMarked = ids.some((id) => {
    const status = byMemberId[id];
    return status === "present" || status === "absent";
  });

  const mode = occurrence.withinMarkingWindow ? "marking" : "historical";

  return {
    ok: true,
    mode,
    sessionDate: occurrence.sessionDate,
    isMarked,
    withinMarkingWindow: occurrence.withinMarkingWindow,
    markingWindowEnd: occurrence.markingWindowEnd || null,
    byMemberId,
  };
}
