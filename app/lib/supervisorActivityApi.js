/**
 * Lectures pour le fil d'activité superviseur.
 */
import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

const SUPABASE_TIMEOUT_MS = 15000;
const FETCH_LIMIT = 80;
const PRESENCE_FETCH_LIMIT = 200;

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
  return msg || mapSupabaseAuthError(error);
}

function fail(error, tableLabel) {
  return {
    ok: false,
    error: error?.message || mapTableError(error, tableLabel),
    rows: [],
  };
}

/** Saisies de progression — horodatage : colonne `date` (timestamptz). */
export async function fetchSeanceProgressActivity(membreIds, sinceIso) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", rows: [] };
  }
  if (!membreIds?.length) {
    return { ok: true, rows: [] };
  }

  try {
    const result = await withTimeout(
      supabase
        .from("progression")
        .select("id, membre_id, date")
        .in("membre_id", membreIds)
        .gte("date", sinceIso)
        .order("date", { ascending: false })
        .limit(FETCH_LIMIT),
      SUPABASE_TIMEOUT_MS,
      "قراءة تقدم الأعضاء"
    );
    if (result.error) return fail(result.error, "progression");
    return {
      ok: true,
      rows: (result.data || []).map((row) => ({
        id: row.id,
        membreId: row.membre_id,
        at: row.date || null,
      })),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", rows: [] };
  }
}

/**
 * Présences de la séance. Une ligne d'activité par occurrence (seance_id, date),
 * horodatage = created_at le plus récent du groupe.
 */
export async function fetchSeancePresenceActivity(seanceId, sinceIso) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", rows: [] };
  }
  if (!seanceId) {
    return { ok: true, rows: [] };
  }

  try {
    const result = await withTimeout(
      supabase
        .from("presences")
        .select("seance_id, date, created_at")
        .eq("seance_id", seanceId)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(PRESENCE_FETCH_LIMIT),
      SUPABASE_TIMEOUT_MS,
      "قراءة حضور الحصة"
    );
    if (result.error) return fail(result.error, "presences");

    const grouped = new Map();
    (result.data || []).forEach((row) => {
      const occurrenceDate = row.date != null ? String(row.date).slice(0, 10) : "";
      if (!occurrenceDate || !row.created_at) return;
      const key = `${row.seance_id}|${occurrenceDate}`;
      const prev = grouped.get(key);
      if (!prev || String(row.created_at) > String(prev.at)) {
        grouped.set(key, {
          seanceId: row.seance_id,
          date: occurrenceDate,
          at: row.created_at,
        });
      }
    });

    return { ok: true, rows: Array.from(grouped.values()) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", rows: [] };
  }
}

/**
 * Inscriptions acceptées de la séance — horodatage : date_inscription (timestamptz).
 * statut = accepte uniquement : une demande en attente n'est pas une arrivée.
 */
export async function fetchSeanceInscriptionActivity(seanceId, sinceIso) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", rows: [] };
  }
  if (!seanceId) {
    return { ok: true, rows: [] };
  }

  try {
    const result = await withTimeout(
      supabase
        .from("inscriptions")
        .select("id, membre_id, date_inscription")
        .eq("seance_id", seanceId)
        .eq("statut", "accepte")
        .gte("date_inscription", sinceIso)
        .order("date_inscription", { ascending: false })
        .limit(FETCH_LIMIT),
      SUPABASE_TIMEOUT_MS,
      "قراءة انضمام الأعضاء"
    );
    if (result.error) return fail(result.error, "inscriptions");
    return {
      ok: true,
      rows: (result.data || []).map((row) => ({
        id: row.id,
        membreId: row.membre_id,
        at: row.date_inscription || null,
      })),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", rows: [] };
  }
}
