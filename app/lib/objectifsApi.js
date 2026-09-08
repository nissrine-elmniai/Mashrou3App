import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { TOTAL_HIZB } from "./tumun";

const SUPABASE_TIMEOUT_MS = 15000;
const TABLE = "objectifs";

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

async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

function isNonEmptySaisonId(saisonId) {
  return saisonId != null && String(saisonId).trim() !== "";
}

function parseNbHizbCible(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_HIZB) {
    return {
      ok: false,
      error: "عدد الأحزاب المستهدفة يجب أن يكون بين 1 و 60",
    };
  }
  return { ok: true, value: n };
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
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select("membre_id, saison_id, nb_hizb_cible, created_at")
        .eq("membre_id", userId)
        .eq("saison_id", String(saisonId).trim())
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
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
 * Upsert UNIQUE (membre_id, saison_id). Validation locale avant le réseau.
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

  try {
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .upsert(
          {
            membre_id: userId,
            saison_id: String(saisonId).trim(),
            nb_hizb_cible: parsed.value,
          },
          { onConflict: "membre_id,saison_id" }
        )
        .select("membre_id, saison_id, nb_hizb_cible, created_at")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ هدف الموسم"
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
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select("membre_id, saison_id, nb_hizb_cible, created_at")
        .eq("membre_id", membreId)
        .eq("saison_id", String(saisonId).trim())
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
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
