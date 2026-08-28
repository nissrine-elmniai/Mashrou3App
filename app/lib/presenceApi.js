import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

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

/** Normalise un statut de présence depuis une ligne DB hétérogène. */
function normalizePresenceStatus(row) {
  if (row == null) return "unset";
  if (row.present === true || row.present === "true") return "present";
  if (row.present === false || row.present === "false") return "absent";
  const raw = String(row.statut || row.status || row.etat || "").toLowerCase();
  if (raw === "present" || raw === "حاضر" || raw === "présent") return "present";
  if (raw === "absent" || raw === "غائب" || raw === "absence") return "absent";
  return "unset";
}

function extractPresenceDate(row) {
  const raw = row.date || row.date_seance || row.date_presence || row.session_date;
  if (raw) {
    return String(raw).slice(0, 10).replace(/-/g, "/");
  }
  if (row.created_at) {
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
    let query = supabase.from("presences").select("*").eq("membre_id", membreId);
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
      let fbQuery = supabase.from("presences").select("*").eq("membre_id", membreId);
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
        .select("membre_id, statut, status, etat, present")
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
