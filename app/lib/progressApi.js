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

/** Traduit une erreur de table Supabase (table absente / RLS / doublon / autre). */
function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/column.*does not exist/i.test(msg)) {
    return msg;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/duplicate key|23505/i.test(msg)) {
    return "سجل مكرر — هذه العملية مسجلة مسبقاً";
  }
  return mapSupabaseAuthError(error);
}

/** Tri sans created_at (absent sur certaines bases CdC distantes). */
function applyProgressionOrder(query) {
  return query.order("date_saisie", { ascending: false });
}

async function fetchProgressionOrdered(buildQuery, label) {
  let { data, error } = await withTimeout(
    applyProgressionOrder(buildQuery()),
    SUPABASE_TIMEOUT_MS,
    label
  );
  if (error && /column.*date_saisie.*does not exist/i.test(error?.message || "")) {
    ({ data, error } = await withTimeout(
      buildQuery().order("date", { ascending: false }),
      SUPABASE_TIMEOUT_MS,
      label
    ));
  }
  return { data, error };
}

/** Id du membre connecté via la session Supabase, ou null. */
async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/**
 * Progression personnelle du membre connecté (historique des saisies,
 * plus récentes d'abord). @returns { ok, entries }
 */
export async function getMyProgress() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    const { data, error } = await fetchProgressionOrdered(
      () => supabase.from("progression").select("*").eq("membre_id", userId),
      "قراءة التقدم"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "progression") };
    }
    return { ok: true, entries: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Saisie d'une progression personnelle (juz/tumun mémorisé).
 * @param {object} payload { juze (1..30), tumun (1..8, optionnel), note (optionnel), dateSaisie (optionnel) }
 * @returns { ok, entry? }
 */
export async function addProgressEntry({ juze, tumun = null, note = null, dateSaisie = null }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const numJuze = Number(juze);
  if (!Number.isInteger(numJuze) || numJuze < 1 || numJuze > 30) {
    return { ok: false, error: "أدخل جزءاً صحيحاً بين 1 و 30" };
  }
  if (tumun !== null && tumun !== undefined && tumun !== "") {
    const numTumun = Number(tumun);
    if (!Number.isInteger(numTumun) || numTumun < 1 || numTumun > 8) {
      return { ok: false, error: "أدخل ثمناً صحيحاً بين 1 و 8" };
    }
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const row = {
    membre_id: userId,
    juze: numJuze,
    tumun: tumun === null || tumun === undefined || tumun === "" ? null : Number(tumun),
    note: note || null,
  };
  if (dateSaisie) {
    row.date_saisie = dateSaisie;
  }

  try {
    const { data, error } = await withTimeout(
      supabase.from("progression").insert(row).select("*").single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ التقدم"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "progression") };
    }
    return { ok: true, entry: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Progressions des membres d'une séance (côté superviseur), avec le profil
 * de chaque membre joint. @returns { ok, entries }
 */
export async function getSeanceMemberProgress(seanceId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }

  try {
    const { data: inscriptions, error: iError } = await withTimeout(
      supabase
        .from("inscriptions")
        .select("membre_id")
        .eq("seance_id", seanceId)
        .eq("statut", "accepte"),
      SUPABASE_TIMEOUT_MS,
      "قراءة الحصة"
    );
    if (iError) {
      return { ok: false, error: mapTableError(iError, "inscriptions") };
    }

    const membreIds = (inscriptions || []).map((i) => i.membre_id);
    if (membreIds.length === 0) {
      return { ok: true, entries: [] };
    }

    const { data, error } = await fetchProgressionOrdered(
      () =>
        supabase
          .from("progression")
          .select("*, membre:profiles!progression_membre_id_fkey(first_name, last_name, email)")
          .in("membre_id", membreIds),
      "قراءة التقدم"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "progression") };
    }
    return { ok: true, entries: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Total des ثمن (8 × 60 حزب) pour le % global du Coran. */
export const PROGRESS_TOTAL_TUMUN = 480;

/**
 * Calcule le % global et les indicateurs depuis une ligne progression (juze/tumun).
 * Formule : (nb_hizb_completes × 8 + tumun_courant) / 480
 * — nb_hizb_completes = juze − 1 (جزء كامل محفوظ قبل الجزء الحالي)
 */
export function computeProgressMetrics(row) {
  if (!row?.juze) {
    return null;
  }
  const juze = Number(row.juze);
  const tumunCourant = row.tumun != null && row.tumun !== "" ? Number(row.tumun) : 0;
  const nbHizbCompletes = Math.max(0, juze - 1);
  const tumunTotal = nbHizbCompletes * 8 + tumunCourant;
  const globalPct = Math.min(
    100,
    Math.round((tumunTotal / PROGRESS_TOTAL_TUMUN) * 100)
  );
  return {
    juzeCourant: juze,
    tumunCourant: row.tumun != null && row.tumun !== "" ? Number(row.tumun) : null,
    nbHizbCompletes,
    globalPct,
    dateSaisie: row.date_saisie || null,
  };
}

/**
 * Dernière saisie de progression d'un membre (superviseur / admin via RLS).
 * @returns {{ ok, hasData?, entry?, metrics?, error? }}
 */
export async function getMemberProgressionSummary(membreId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!membreId) {
    return { ok: false, error: "معرّف العضو مفقود" };
  }

  try {
    const { data, error } = await fetchProgressionOrdered(
      () => supabase.from("progression").select("*").eq("membre_id", membreId).limit(1),
      "قراءة تقدم العضو"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "progression") };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { ok: true, hasData: false };
    }
    const metrics = computeProgressMetrics(row);
    return { ok: true, hasData: true, entry: row, metrics };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Objectif de saison (hifz_amount / level depuis member_applications).
 * Pas de table objectifs — retourne null si absent ou sans permission RLS.
 */
export async function getMemberSeasonObjectif(membreId, saisonId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!membreId || !saisonId) {
    return { ok: true, objectif: null };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("member_applications")
        .select("hifz_amount, level")
        .eq("user_id", membreId)
        .eq("season_id", saisonId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة هدف العضو"
    );
    if (error) {
      const msg = error?.message || "";
      if (/permission|row-level security|RLS|42501/i.test(msg)) {
        return { ok: true, objectif: null };
      }
      return { ok: false, error: mapTableError(error, "member_applications") };
    }
    const objectif = data?.hifz_amount || data?.level || null;
    return { ok: true, objectif };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Toutes les progressions, avec le profil de chaque membre joint.
 * RLS : progression_admin_select (lecture globale admin uniquement).
 * @returns { ok, entries }
 */
export async function getAllProgressionAdmin() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await fetchProgressionOrdered(
      () =>
        supabase
          .from("progression")
          .select("*, membre:profiles!progression_membre_id_fkey(first_name, last_name, email)"),
      "قراءة التقدم الكلي"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "progression") };
    }
    return { ok: true, entries: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
