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
  const code = String(error?.code || "");
  if (/saisons_one_active_per_type/i.test(msg)) {
    return "يوجد موسم نشط بالفعل من هذا النوع — أوقف الموسم الحالي أولاً";
  }
  if (/saisons_registration_requires_active/i.test(msg)) {
    return "لا يمكن فتح التسجيل لموسم غير نشط";
  }
  if (code === "23505" || /duplicate key|23505/i.test(msg)) {
    return "سجل مكرر — هذه العملية مسجلة مسبقاً";
  }
  if (code === "23514" || /violates check constraint|23514/i.test(msg)) {
    return "البيانات لا تستوفي شروط الموسم";
  }
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  return mapSupabaseAuthError(error);
}

/**
 * Date de début de saison : YYYY-MM-DD, ou YYYY/M/D converti.
 * Toute autre forme (JJ/MM/AAAA compris) est refusée.
 */
export function parseSeasonStartDate(value) {
  const raw = String(value || "").trim();
  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    iso = raw;
  } else {
    const slash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (slash) {
      iso = `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
    }
  }
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return iso;
}

function rowToSeason(row) {
  return {
    id: row.id,
    name: row.name,
    type: String(row.type || "regular").trim().toLowerCase() || "regular",
    startDate: row.start_date,
    endDate: row.end_date,
    version: row.version != null ? Number(row.version) : null,
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
    version: season.version != null ? Number(season.version) : null,
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

/**
 * Annuaire des musims lu dans Supabase (pas le cache AppContext).
 * La saison active est une ligne active = true. S'il y en a plusieurs,
 * le type regular est retenu. Aucun repli sur un musim inactif.
 */
export async function fetchSeasonDirectory() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.from("saisons").select("id, name, type, active"),
      SUPABASE_TIMEOUT_MS,
      "قراءة الموسم النشط"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "saisons") };
    }
    const seasons = (data || []).map((row) => ({
      id: row.id == null ? "" : String(row.id),
      name: row.name || "",
      type: String(row.type || "regular").trim().toLowerCase() || "regular",
      active: !!row.active,
    }));
    const activeSeason =
      seasons.find((season) => season.active && season.type === "regular") ||
      seasons.find((season) => season.active) ||
      null;
    return { ok: true, seasons, activeSeason };
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
    const members = inscRes.ok
      ? new Set(
          (inscRes.inscriptions || []).map((row) => row.membre_id).filter(Boolean)
        ).size
      : 0;
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

const RESET_TIMEOUT_MS = 120000;

/**
 * (Admin) Reset transactionnel de fin de saison.
 * Ne supprime pas les comptes Auth : le client enchaîne delete-user.
 * @returns {{ ok, result?: { saison_id, supervisor_ids, chat_group_ids, counts }, error? }}
 */
export async function startNewSeasonRpc({ name, startDate, version, type }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc("start_new_season", {
        p_name: name,
        p_start_date: startDate,
        p_version: version,
        p_type: type || "regular",
      }),
      RESET_TIMEOUT_MS,
      "انطلاق موسم جديد"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "saisons") };
    }
    return { ok: true, result: data || {} };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
