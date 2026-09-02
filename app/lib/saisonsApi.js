import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { getAllAcceptedInscriptions } from "./seancesApi";

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
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  return mapSupabaseAuthError(error);
}

function rowToSeason(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date,
    registrationOpen: !!row.registration_open,
    active: !!row.active,
    remote: !!row.remote,
  };
}

function seasonToRow(season) {
  return {
    id: season.id,
    name: season.name,
    type: season.type || "regular",
    start_date: season.startDate || null,
    end_date: season.endDate || null,
    registration_open: !!season.registrationOpen,
    active: !!season.active,
    remote: !!season.remote,
    updated_at: new Date().toISOString(),
  };
}

/** (Admin) Liste des musims, plus récents d'abord. */
export async function fetchSaisons() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from("saisons").select("*").order("created_at", { ascending: false }),
      SUPABASE_TIMEOUT_MS,
      "قراءة المواسم"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "saisons") };
    }
    return { ok: true, seasons: (data || []).map(rowToSeason) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** (Admin) Création ou mise à jour d'un musim. */
export async function upsertSaison(season) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!season?.id || !season?.name) {
    return { ok: false, error: "بيانات الموسم غير مكتملة" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from("saisons").upsert(seasonToRow(season)).select("*").single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ الموسم"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "saisons") };
    }
    return { ok: true, season: rowToSeason(data) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** (Admin) Ferme les musims ordinaires donnés côté serveur. */
export async function closeRegularSaisons(saisonIds = []) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }
  const ids = [...new Set((saisonIds || []).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true };
  }
  try {
    const { error } = await withTimeout(
      supabase
        .from("saisons")
        .update({
          active: false,
          registration_open: false,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("type", "regular"),
      SUPABASE_TIMEOUT_MS,
      "إغلاق المواسم"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "saisons") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Hydrate les musims : priorité Supabase ; si vide, pousse le cache local.
 * @returns {{ ok, seasons }}
 */
export async function syncSeasonsWithSupabase(localSeasons = []) {
  if (!isSupabaseConfigured()) {
    return { ok: true, seasons: localSeasons, source: "local" };
  }
  const remote = await fetchSaisons();
  if (!remote.ok) {
    return { ok: false, seasons: localSeasons, error: remote.error };
  }
  if (remote.seasons.length > 0) {
    return { ok: true, seasons: remote.seasons, source: "remote" };
  }
  if (localSeasons.length > 0) {
    await Promise.all(localSeasons.map((s) => upsertSaison(s)));
    return { ok: true, seasons: localSeasons, source: "pushed" };
  }
  return { ok: true, seasons: [], source: "empty" };
}

/** (Admin) Compteurs tableau de bord pour un musim donné. */
export async function getSeasonDashboardStats(saisonId) {
  if (!isSupabaseConfigured() || !saisonId) {
    return { ok: true, members: 0, supervisors: 0, seances: 0 };
  }
  try {
    const [seancesRes, inscRes] = await Promise.all([
      withTimeout(
        supabase
          .from("seances")
          .select("id, superviseur_id")
          .eq("saison_id", saisonId)
          .eq("statut", "active"),
        SUPABASE_TIMEOUT_MS,
        "قراءة الحصص"
      ),
      getAllAcceptedInscriptions({ saisonId }),
    ]);
    if (seancesRes.error) {
      return { ok: false, error: mapTableError(seancesRes.error, "seances") };
    }
    const seances = seancesRes.data || [];
    const supervisorIds = new Set(
      seances.map((s) => s.superviseur_id).filter(Boolean)
    );
    const members = inscRes.ok ? inscRes.inscriptions.length : 0;
    return {
      ok: true,
      members,
      supervisors: supervisorIds.size,
      seances: seances.length,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
