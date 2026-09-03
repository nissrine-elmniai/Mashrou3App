import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import {
  TUMUNS_PER_HIZB,
  TOTAL_HIZB,
  clampMemberTumuns,
  positionFromMemberTumuns,
} from "./tumun";

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

/**
 * Plus récent d'abord via `date` (timestamptz NOT NULL, défaut now()).
 * `date_saisie` (type date, sans heure) ne départage pas deux saisies du
 * même jour — ne plus l'utiliser pour ce tri.
 * `created_at` est absent sur certaines bases CdC — on ne l'utilise pas.
 */
function applyProgressionOrder(query) {
  return query
    .order("date", { ascending: false })
    .order("id", { ascending: false });
}

async function fetchProgressionOrdered(buildQuery, label) {
  return withTimeout(
    applyProgressionOrder(buildQuery()),
    SUPABASE_TIMEOUT_MS,
    label
  );
}

/** Id du membre connecté via la session Supabase, ou null. */
async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/**
 * Progression d'un membre (historique, plus récentes d'abord via `date`).
 * @returns { ok, entries }
 */
export async function getMemberProgressEntries(membreId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!membreId) {
    return { ok: false, error: "معرّف العضو مفقود" };
  }

  try {
    const { data, error } = await fetchProgressionOrdered(
      () => supabase.from("progression").select("*").eq("membre_id", membreId),
      "قراءة تقدم العضو"
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
 * Progression personnelle du membre connecté (historique des saisies,
 * plus récentes d'abord). @returns { ok, entries }
 */
export async function getMyProgress() {
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }
  return getMemberProgressEntries(userId);
}

const MAX_TUMUN_COURANT = TUMUNS_PER_HIZB - 1; // 0–7
const HISTORY_DEBOUNCE_MS = 800;
/** Total des ثمن (8 × 60 حزب) pour le % global du Coran. */
export const PROGRESS_TOTAL_TUMUN = TOTAL_HIZB * TUMUNS_PER_HIZB;

/** Dernière position membre connue (ثمن totaux 0–480). null = pas encore lue / invalidée. */
let cachedMemberTumuns = null;

function rememberMemberTumunsFromRow(row) {
  const metrics = computeProgressMetrics(row);
  if (metrics?.tumunTotal != null) {
    cachedMemberTumuns = clampMemberTumuns(metrics.tumunTotal);
  }
}

function invalidateMemberTumunsCache() {
  cachedMemberTumuns = null;
}

/**
 * Construit une ligne `progression` depuis la position membre (pas un programme).
 * tumunCourant : reste 0–7. Le juz n'est jamais stocké.
 * @returns {{ ok: true, row } | { ok: false, error }}
 */
export function buildProgressRow({
  membreId,
  nbHizbCompletes,
  tumunCourant,
  saisonId = null,
  notes = null,
}) {
  const hizbNum = Number(nbHizbCompletes);
  const tumunNum = Number(tumunCourant);
  if (!Number.isInteger(hizbNum) || hizbNum < 0 || hizbNum > TOTAL_HIZB) {
    return { ok: false, error: "عدد الأحزاب المكتملة يجب أن يكون بين 0 و 60" };
  }
  if (!Number.isInteger(tumunNum) || tumunNum < 0 || tumunNum > MAX_TUMUN_COURANT) {
    return { ok: false, error: "الثمن الحالي يجب أن يكون بين 0 و 7" };
  }
  const total = hizbNum * TUMUNS_PER_HIZB + tumunNum;
  if (total > PROGRESS_TOTAL_TUMUN) {
    return { ok: false, error: "تجاوزت موضع نهاية القرآن (60 حزباً)" };
  }
  return {
    ok: true,
    row: {
      membre_id: membreId,
      saison_id: saisonId ?? null,
      nb_hizb_completes: hizbNum,
      tumun_courant: tumunNum,
      notes: notes || null,
    },
  };
}

/**
 * Saisie d'une position membre (insert). Invalide le cache puis le recale
 * sur la ligne écrite — le prochain ± programme relit toujours la base.
 * @param {object} payload { nbHizbCompletes, tumunCourant, saisonId?, notes? }
 * @returns { ok, entry? }
 */
export async function addProgressEntry({
  nbHizbCompletes,
  tumunCourant,
  saisonId = null,
  notes = null,
}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const built = buildProgressRow({
    membreId: userId,
    nbHizbCompletes,
    tumunCourant,
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
    invalidateMemberTumunsCache();
    if (data) rememberMemberTumunsFromRow(data);
    return { ok: true, entry: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

let pendingDelta = 0;
let pendingNotes = null;
let pendingSaisonId = null;
let flushTimer = null;
let flushInFlight = null;

async function resolveBaseMemberTumuns(userId) {
  const summary = await getMemberProgressionSummary(userId);
  if (!summary.ok) {
    return { error: summary.error };
  }
  const base =
    summary.hasData && summary.metrics?.tumunTotal != null
      ? clampMemberTumuns(summary.metrics.tumunTotal)
      : 0;
  cachedMemberTumuns = base;
  return base;
}

/**
 * Agrège des ±1 ثمن (debounce) puis écrit UNE ligne = dernière position réelle + delta.
 * Relit la dernière ligne au flush (tri `date`), jamais un cache rempli par une
 * lecture d'historique. Les appuis du même burst n'entraînent qu'une lecture.
 */
export function scheduleMemberProgressDelta({
  delta,
  saisonId = null,
  notes = null,
}) {
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0) return;
  pendingDelta += d;
  pendingSaisonId = saisonId;
  if (notes) pendingNotes = notes;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushMemberProgressDelta();
  }, HISTORY_DEBOUNCE_MS);
}

/** Applique le delta en attente. À appeler au démontage d'écran. */
export async function flushMemberProgressDelta() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const delta = pendingDelta;
  const notes = pendingNotes;
  const saisonId = pendingSaisonId;
  pendingDelta = 0;
  pendingNotes = null;
  pendingSaisonId = null;
  if (delta === 0) {
    return { ok: true, skipped: true };
  }

  if (flushInFlight) {
    await flushInFlight;
    pendingDelta += delta;
    pendingNotes = notes;
    pendingSaisonId = saisonId;
    return flushMemberProgressDelta();
  }

  flushInFlight = (async () => {
    if (!isSupabaseConfigured()) {
      return { ok: false, error: "Supabase غير مفعّل" };
    }
    const userId = await currentAuthId();
    if (!userId) {
      return { ok: false, error: "يجب تسجيل الدخول" };
    }
    const baseOrErr = await resolveBaseMemberTumuns(userId);
    if (baseOrErr && typeof baseOrErr === "object" && baseOrErr.error) {
      return { ok: false, error: baseOrErr.error };
    }
    const base = Number(baseOrErr) || 0;
    const next = clampMemberTumuns(base + delta);
    if (next === base) {
      return { ok: true, unchanged: true };
    }
    const pos = positionFromMemberTumuns(next);
    return addProgressEntry({
      nbHizbCompletes: pos.nbHizbCompletes,
      tumunCourant: pos.tumunCourant,
      saisonId,
      notes,
    });
  })();

  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Instant de `progression.date` (timestamptz). 0 si absent / invalide. */
function parseProgressDateMs(row) {
  const raw = row?.date;
  if (raw == null || raw === "") return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function rowTumunTotal(row) {
  return computeProgressMetrics(row)?.tumunTotal ?? 0;
}

function datedProgressionAsc(entries) {
  return (entries || [])
    .map((e) => ({ e, t: parseProgressDateMs(e) }))
    .filter((x) => x.t > 0)
    .sort((a, b) => {
      const d = a.t - b.t;
      if (d !== 0) return d;
      return String(a.e?.id || "").localeCompare(String(b.e?.id || ""));
    });
}

/** Dernière ligne (`date`), même critère que le tri serveur et le rythme. */
export function latestProgressionRow(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const dated = datedProgressionAsc(entries);
  if (dated.length > 0) return dated[dated.length - 1].e;
  return entries[0];
}

/**
 * Delta de saison : dernière − première ligne de la saison active (`date`).
 * Ignore les lignes `saison_id` null. Masqué si < 2 lignes ou delta 0.
 */
function computeSeasonDeltaTumuns(entries, saisonId) {
  if (saisonId == null || saisonId === "") return null;
  const sid = String(saisonId);
  const ofSeason = datedProgressionAsc(
    (entries || []).filter(
      (e) => e?.saison_id != null && e.saison_id !== "" && String(e.saison_id) === sid
    )
  );
  if (ofSeason.length < 2) return null;
  const delta =
    rowTumunTotal(ofSeason[ofSeason.length - 1].e) - rowTumunTotal(ofSeason[0].e);
  return delta === 0 ? null : delta;
}

/**
 * Delta 7 jours : position actuelle − dernière ligne strictement avant J-7
 * (sinon première ligne du membre, si plus récente que J-7).
 * Net de position, pas un décompte de lignes. Masqué si delta 0 / pas de date.
 */
function computeWeekDeltaTumuns(entries, now) {
  const dated = datedProgressionAsc(entries);
  if (dated.length === 0) return null;
  const current = dated[dated.length - 1];
  const cutoff = now.getTime() - WEEK_MS;
  const before = dated.filter((x) => x.t < cutoff);
  const baseline = before.length > 0 ? before[before.length - 1] : dated[0];
  const delta = rowTumunTotal(current.e) - rowTumunTotal(baseline.e);
  return delta === 0 ? null : delta;
}

/**
 * Indicateurs de rythme (carte التقدم). Une passe sur les lignes déjà chargées.
 * @returns {{ seasonDeltaTumuns: number|null, weekDeltaTumuns: number|null }}
 */
export function computeProgressPace(entries, saisonId, now = new Date()) {
  return {
    seasonDeltaTumuns: computeSeasonDeltaTumuns(entries, saisonId),
    weekDeltaTumuns: computeWeekDeltaTumuns(entries, now),
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
    const selfId = await currentAuthId();
    if (selfId && membreId === selfId) {
      rememberMemberTumunsFromRow(row);
    }
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
