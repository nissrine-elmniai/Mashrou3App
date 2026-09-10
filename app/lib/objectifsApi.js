import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { TOTAL_HIZB } from "./tumun";

const SUPABASE_TIMEOUT_MS = 15000;
const TABLE = "objectifs";
const COLUMNS_WITH_DEPART =
  "membre_id, saison_id, nb_hizb_cible, nb_hizb_depart, created_at";
const COLUMNS_WITHOUT_DEPART = "membre_id, saison_id, nb_hizb_cible, created_at";

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
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
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

/** Position de départ : entier 0–60. Vide / null → 0. */
function parseNbHizbDepart(raw) {
  if (raw == null || raw === "") {
    return { ok: true, value: 0 };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > TOTAL_HIZB) {
    return {
      ok: false,
      error: "موضع الانطلاق يجب أن يكون بين 0 و 60",
    };
  }
  return { ok: true, value: n };
}

function mapObjectifRow(row) {
  if (!row) return null;
  const parsed = parseNbHizbCible(row.nb_hizb_cible);
  if (!parsed.ok) return null;
  const depart = parseNbHizbDepart(row.nb_hizb_depart);
  return {
    membreId: row.membre_id,
    saisonId: row.saison_id,
    nbHizbCible: parsed.value,
    nbHizbDepart: depart.ok ? depart.value : 0,
    createdAt: row.created_at || null,
  };
}

function isRlsDenied(error) {
  const msg = error?.message || "";
  return /permission|row-level security|RLS|42501/i.test(msg);
}

async function fetchObjectifRow(membreId, saisonId, label) {
  const saison = String(saisonId).trim();
  let { data, error } = await withTimeout(
    supabase
      .from(TABLE)
      .select(COLUMNS_WITH_DEPART)
      .eq("membre_id", membreId)
      .eq("saison_id", saison)
      .maybeSingle(),
    SUPABASE_TIMEOUT_MS,
    label
  );
  if (error && mentionsMissingColumn(error, "nb_hizb_depart")) {
    ({ data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select(COLUMNS_WITHOUT_DEPART)
        .eq("membre_id", membreId)
        .eq("saison_id", saison)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      label
    ));
  }
  return { data, error };
}

async function insertObjectifRow(row) {
  let payload = { ...row };
  let select = COLUMNS_WITH_DEPART;
  for (let i = 0; i < 3; i += 1) {
    const { data, error } = await withTimeout(
      supabase.from(TABLE).insert(payload).select(select).single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ هدف الموسم"
    );
    if (!error) return { data, error: null };
    if (mentionsMissingColumn(error, "nb_hizb_depart")) {
      const { nb_hizb_depart: _depart, ...rest } = payload;
      payload = rest;
      select = COLUMNS_WITHOUT_DEPART;
      continue;
    }
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
  let select = COLUMNS_WITH_DEPART;
  for (let i = 0; i < 3; i += 1) {
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .update(patch)
        .eq("membre_id", userId)
        .eq("saison_id", saison)
        .select(select)
        .single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ هدف الموسم"
    );
    if (!error) return { data, error: null };
    if (mentionsMissingColumn(error, "nb_hizb_depart")) {
      select = COLUMNS_WITHOUT_DEPART;
      continue;
    }
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
 * Upsert UNIQUE (membre_id, saison_id).
 * `nb_hizb_depart` n'est écrit qu'à la CRÉATION ; une modification ultérieure
 * de `nb_hizb_cible` conserve le départ déjà stocké.
 */
export async function setMyObjectif(saisonId, nbHizbCible, nbHizbDepart) {
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
  const parsedDepart = parseNbHizbDepart(nbHizbDepart);
  if (!parsedDepart.ok) {
    return parsedDepart;
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
      const keptDepart = mapObjectifRow(existing.data)?.nbHizbDepart ?? 0;
      const { data, error } = await updateObjectifCible(
        userId,
        saison,
        parsed.value,
        now
      );
      if (error) {
        return { ok: false, error: mapTableError(error, TABLE) };
      }
      const mapped = mapObjectifRow(data);
      if (mapped && data?.nb_hizb_depart == null) {
        mapped.nbHizbDepart = keptDepart;
      }
      return { ok: true, objectif: mapped };
    }

    const { data, error } = await insertObjectifRow({
      membre_id: userId,
      saison_id: saison,
      nb_hizb_cible: parsed.value,
      nb_hizb_depart: parsedDepart.value,
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
