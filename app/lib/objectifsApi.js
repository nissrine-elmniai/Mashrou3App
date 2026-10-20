import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { getCurrentAuthId } from "./currentAuth";
import { TOTAL_HIZB } from "./tumun";

const SUPABASE_TIMEOUT_MS = 15000;
const TABLE = "objectifs";
/**
 * nb_hizb_depart (0062) n'est plus lu ni écrit : le départ est calculé par
 * le serveur (get_member_season_progress, 0135). Colonne gardée, défaut 0.
 */
const COLUMNS = "membre_id, saison_id, nb_hizb_cible, created_at";

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

export const OBJECTIF_LOCKED_MESSAGE =
  "لا يمكن تحديد الهدف قبل التسجيل في الموسم الحالي";

/** Trigger objectifs_require_position (0137) : pas de départ de saison connu. */
export const OBJECTIF_POSITION_REQUIRED_MESSAGE =
  "احفظ موضعك أولاً قبل تحديد هدف الموسم";

function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  const details = `${error?.details || ""} ${error?.hint || ""}`;
  if (
    msg.includes(OBJECTIF_LOCKED_MESSAGE) ||
    details.includes(OBJECTIF_LOCKED_MESSAGE)
  ) {
    return OBJECTIF_LOCKED_MESSAGE;
  }
  if (
    msg.includes(OBJECTIF_POSITION_REQUIRED_MESSAGE) ||
    details.includes(OBJECTIF_POSITION_REQUIRED_MESSAGE)
  ) {
    return OBJECTIF_POSITION_REQUIRED_MESSAGE;
  }
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

function mentionsMissingColumn(error, columnName) {
  const msg = error?.message || "";
  return (
    new RegExp(columnName, "i").test(msg) &&
    /does not exist|schema cache/i.test(msg)
  );
}

async function currentAuthId() {
  // Id local (AppContext ou session stockée) : pas d'appel réseau. Droits vérifiés par RLS.
  return getCurrentAuthId();
}

function isNonEmptySaisonId(saisonId) {
  return saisonId != null && String(saisonId).trim() !== "";
}

/**
 * Saisie d'un objectif de saison : entier 1–60 (hizb), lu comme INCRÉMENT.
 * Chaîne vide ou texte non numérique (ex. « جزء عم ») → ok: false, sans valeur inventée.
 */
export function parseObjectifInput(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") {
    return { ok: false, error: "أدخل عدد الأحزاب المستهدفة (1 إلى 60)" };
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_HIZB) {
    return {
      ok: false,
      error: "عدد الأحزاب المستهدفة يجب أن يكون بين 1 و 60",
    };
  }
  return { ok: true, value: n };
}

function parseNbHizbCible(raw) {
  return parseObjectifInput(raw);
}

function mapObjectifRow(row) {
  if (!row) return null;
  const parsed = parseNbHizbCible(row.nb_hizb_cible);
  if (!parsed.ok) return null;
  return {
    membreId: row.membre_id,
    saisonId: row.saison_id,
    nbHizbCible: parsed.value,
    createdAt: row.created_at || null,
  };
}

function isRlsDenied(error) {
  const msg = error?.message || "";
  return /permission|row-level security|RLS|42501/i.test(msg);
}

async function fetchObjectifRow(membreId, saisonId, label) {
  const saison = String(saisonId).trim();
  const { data, error } = await withTimeout(
    supabase
      .from(TABLE)
      .select(COLUMNS)
      .eq("membre_id", membreId)
      .eq("saison_id", saison)
      .maybeSingle(),
    SUPABASE_TIMEOUT_MS,
    label
  );
  return { data, error };
}

async function insertObjectifRow(row) {
  let payload = { ...row };
  for (let i = 0; i < 2; i += 1) {
    const { data, error } = await withTimeout(
      supabase.from(TABLE).insert(payload).select(COLUMNS).single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ هدف الموسم"
    );
    if (!error) return { data, error: null };
    if (mentionsMissingColumn(error, "updated_at")) {
      const { updated_at: _updated, ...rest } = payload;
      payload = rest;
      continue;
    }
    return { data: null, error };
  }
  return { data: null, error: { message: "تعذر حفظ الهدف" } };
}

async function updateObjectifCible(userId, saison, nbHizbCible, now) {
  let patch = { nb_hizb_cible: nbHizbCible, updated_at: now };
  for (let i = 0; i < 2; i += 1) {
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .update(patch)
        .eq("membre_id", userId)
        .eq("saison_id", saison)
        .select(COLUMNS)
        .single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ هدف الموسم"
    );
    if (!error) return { data, error: null };
    if (mentionsMissingColumn(error, "updated_at")) {
      const { updated_at: _updated, ...rest } = patch;
      patch = rest;
      continue;
    }
    return { data: null, error };
  }
  return { data: null, error: { message: "تعذر حفظ الهدف" } };
}

/**
 * Objectif du membre connecté pour une saison.
 * Ligne absente → { ok: true, objectif: null }.
 */
export async function getMyObjectif(saisonId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!isNonEmptySaisonId(saisonId)) {
    return { ok: true, objectif: null };
  }

  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    const { data, error } = await fetchObjectifRow(
      userId,
      saisonId,
      "قراءة هدف الموسم"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, TABLE) };
    }
    return { ok: true, objectif: mapObjectifRow(data) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Upsert UNIQUE (membre_id, saison_id). Seul `nb_hizb_cible` est écrit :
 * le départ est calculé par le serveur, quel que soit l'ordre de saisie.
 */
export async function setMyObjectif(saisonId, nbHizbCible) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!isNonEmptySaisonId(saisonId)) {
    return { ok: false, error: "معرّف الموسم مفقود" };
  }
  const parsed = parseNbHizbCible(nbHizbCible);
  if (!parsed.ok) {
    return parsed;
  }

  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const saison = String(saisonId).trim();
  const now = new Date().toISOString();

  try {
    const existing = await fetchObjectifRow(userId, saison, "قراءة هدف الموسم");
    if (existing.error) {
      return { ok: false, error: mapTableError(existing.error, TABLE) };
    }

    if (existing.data) {
      const { data, error } = await updateObjectifCible(
        userId,
        saison,
        parsed.value,
        now
      );
      if (error) {
        return { ok: false, error: mapTableError(error, TABLE) };
      }
      return { ok: true, objectif: mapObjectifRow(data) };
    }

    const { data, error } = await insertObjectifRow({
      membre_id: userId,
      saison_id: saison,
      nb_hizb_cible: parsed.value,
      updated_at: now,
    });
    if (error) {
      return { ok: false, error: mapTableError(error, TABLE) };
    }
    return { ok: true, objectif: mapObjectifRow(data) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Lecture superviseur / admin. RLS refusée ou ligne absente → objectif null.
 */
export async function getMemberObjectif(membreId, saisonId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!membreId || !isNonEmptySaisonId(saisonId)) {
    return { ok: true, objectif: null };
  }

  try {
    const { data, error } = await fetchObjectifRow(
      membreId,
      saisonId,
      "قراءة هدف العضو"
    );
    if (error) {
      if (isRlsDenied(error)) {
        return { ok: true, objectif: null };
      }
      return { ok: false, error: mapTableError(error, TABLE) };
    }
    return { ok: true, objectif: mapObjectifRow(data) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
