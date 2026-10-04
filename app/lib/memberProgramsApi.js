import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { parseSeasonStartDate } from "./saisonsApi";
import { clampTumuns } from "./tumun";

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
  // Message du trigger (arabe) : le renvoyer tel quel à l'UI.
  if (/[\u0600-\u06FF]/.test(msg)) return msg;
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  return mapSupabaseAuthError(error);
}

export const PROGRAM_TYPE_HIFZ = "hifz";
export const PROGRAM_TYPE_MOURAJA3A = "mouraja3a";

export function normalizeProgramType(raw) {
  return raw === PROGRAM_TYPE_MOURAJA3A
    ? PROGRAM_TYPE_MOURAJA3A
    : PROGRAM_TYPE_HIFZ;
}

export function isHifzProgram(program) {
  return normalizeProgramType(program?.type) === PROGRAM_TYPE_HIFZ;
}

/** progress_percentage (colonne générée SQL) n'est pas lue : le % est recalculé côté client. */
function rowToProgram(row) {
  return {
    id: row.id,
    userId: row.membre_id,
    title: row.title,
    nbHizb: row.nb_hizb,
    durationDays: row.duration_days,
    startDate: row.start_date,
    completedTumuns: row.completed_tumuns ?? 0,
    type: normalizeProgramType(row.type),
  };
}

function programToRow(program, membreId, saisonId) {
  const nbHizb = Number(program.nbHizb) || 0;
  // YYYY/MM/DD (repli todayStr d'AppContext) → YYYY-MM-DD pour la colonne date.
  return {
    id: program.id,
    membre_id: membreId,
    saison_id: saisonId,
    title: program.title,
    nb_hizb: nbHizb,
    duration_days: Number(program.durationDays) || 0,
    start_date: parseSeasonStartDate(program.startDate),
    completed_tumuns: clampTumuns(program.completedTumuns ?? 0, nbHizb),
    type: normalizeProgramType(program.type),
    updated_at: new Date().toISOString(),
  };
}

async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/** Programmes du membre pour la saison active. Sans saison → liste vide. */
export async function fetchMyMemberPrograms(saisonId) {
  if (!saisonId) {
    return { ok: true, programs: [] };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("member_programs")
        .select("*")
        .eq("membre_id", userId)
        .eq("saison_id", saisonId)
        .order("updated_at", { ascending: false }),
      SUPABASE_TIMEOUT_MS,
      "قراءة البرامج"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "member_programs") };
    }
    return { ok: true, programs: (data || []).map(rowToProgram) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Création ou mise à jour d'un programme (sans progress_percentage). */
export async function upsertMemberProgram(program, saisonId) {
  if (!saisonId) {
    return { ok: false, error: "لا يوجد موسم نشط حالياً" };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }
  if (!program?.id || !program?.title) {
    return { ok: false, error: "بيانات البرنامج غير مكتملة" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("member_programs")
        .upsert(programToRow(program, userId, saisonId))
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ البرنامج"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "member_programs") };
    }
    return { ok: true, program: rowToProgram(data) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Suppression distante d'un programme. */
export async function deleteMemberProgramRemote(programId) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }
  const userId = await currentAuthId();
  if (!userId || !programId) {
    return { ok: false, error: "معرّف البرنامج مفقود" };
  }
  try {
    const { error } = await withTimeout(
      supabase
        .from("member_programs")
        .delete()
        .eq("id", programId)
        .eq("membre_id", userId),
      SUPABASE_TIMEOUT_MS,
      "حذف البرنامج"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "member_programs") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Hydrate les programmes depuis Supabase seul.
 * Distant vide → liste vide. Ne pousse jamais le cache local (seed compris).
 * @returns {{ ok, programs, source? }}
 */
export async function syncMemberProgramsWithSupabase(memberId, saisonId) {
  if (!isSupabaseConfigured() || !memberId || !saisonId) {
    return { ok: true, programs: [], source: "empty" };
  }
  const remote = await fetchMyMemberPrograms(saisonId);
  if (!remote.ok) {
    return { ok: false, programs: [], error: remote.error };
  }
  return {
    ok: true,
    programs: remote.programs || [],
    source: remote.programs?.length ? "remote" : "empty",
  };
}
