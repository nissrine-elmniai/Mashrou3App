import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { TUMUNS_PER_HIZB, TOTAL_HIZB, clampTumuns } from "./tumun";

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
 * Construit la ligne `progression` à partir du nombre de ثمن complétés.
 * Le juz n'est jamais stocké : il est dérivé à la lecture (computeProgressMetrics).
 * @returns {{ ok: true, row } | { ok: false, error }}
 */
export function buildProgressRow({ membreId, completedTumuns, nbHizb, saisonId = null, notes = null }) {
  const numNbHizb = Number(nbHizb);
  if (!Number.isInteger(numNbHizb) || numNbHizb <= 0) {
    return { ok: false, error: "عدد الأحزاب غير صالح" };
  }
  const clamped = clampTumuns(completedTumuns, numNbHizb);
  const nbHizbCompletes = Math.floor(clamped / TUMUNS_PER_HIZB);
  if (nbHizbCompletes > TOTAL_HIZB) {
    return { ok: false, error: "عدد الأحزاب المكتملة يتجاوز 60" };
  }
  return {
    ok: true,
    row: {
      membre_id: membreId,
      saison_id: saisonId ?? null,
      nb_hizb_completes: nbHizbCompletes,
      tumun_courant: clamped % TUMUNS_PER_HIZB,
      notes: notes || null,
    },
  };
}

/**
 * Saisie d'une progression personnelle (fil d'activité) à partir des ثمن complétés.
 * @param {object} payload { completedTumuns, nbHizb, saisonId (optionnel), notes (optionnel) }
 * @returns { ok, entry? }
 */
export async function addProgressEntry({ completedTumuns, nbHizb, saisonId = null, notes = null }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const built = buildProgressRow({
    membreId: userId,
    completedTumuns,
    nbHizb,
    saisonId,
    notes,
  });
  if (!built.ok) {
    return built;
  }

  try {
    const { data, error } = await withTimeout(
      supabase.from("progression").insert(built.row).select("*").single(),
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
export const PROGRESS_TOTAL_TUMUN = TOTAL_HIZB * TUMUNS_PER_HIZB;

/**
 * Calcule le % global et les indicateurs depuis une ligne progression
 * (nb_hizb_completes / tumun_courant — colonnes réelles de la table).
 * Formule : (nb_hizb_completes × 8 + tumun_courant) / 480
 * — juzeCourant est dérivé : ceil(nb_hizb_completes / 2) (1 juz = 2 hizb), jamais stocké.
 */
export function computeProgressMetrics(row) {
  if (!row || row.nb_hizb_completes == null) {
    return null;
  }
  const nbHizbCompletes = Math.max(0, Number(row.nb_hizb_completes) || 0);
  const tumunCourant =
    row.tumun_courant != null && row.tumun_courant !== ""
      ? Math.max(0, Number(row.tumun_courant) || 0)
      : 0;
  const tumunTotal = nbHizbCompletes * TUMUNS_PER_HIZB + tumunCourant;
  const globalPct = Math.min(
    100,
    Math.round((tumunTotal / PROGRESS_TOTAL_TUMUN) * 100)
  );
  return {
    juzeCourant: Math.ceil(nbHizbCompletes / 2),
    tumunCourant: tumunCourant > 0 ? tumunCourant : null,
    nbHizbCompletes,
    tumunTotal,
    globalPct,
    notes: row.notes || null,
    dateSaisie: row.date_saisie || row.date || null,
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
