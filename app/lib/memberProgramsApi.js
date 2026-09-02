import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
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
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  return mapSupabaseAuthError(error);
}

function rowToProgram(row) {
  return {
    id: row.id,
    userId: row.membre_id,
    title: row.title,
    nbHizb: row.nb_hizb,
    durationDays: row.duration_days,
    startDate: row.start_date,
    completedTumuns: row.completed_tumuns ?? 0,
  };
}

function programToRow(program, membreId) {
  const nbHizb = Number(program.nbHizb) || 0;
  return {
    id: program.id,
    membre_id: membreId,
    title: program.title,
    nb_hizb: nbHizb,
    duration_days: Number(program.durationDays) || 0,
    start_date: program.startDate || null,
    completed_tumuns: clampTumuns(program.completedTumuns ?? 0, nbHizb),
    updated_at: new Date().toISOString(),
  };
}

async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/** Liste des programmes du membre connecté. */
export async function fetchMyMemberPrograms() {
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
export async function upsertMemberProgram(program) {
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
        .upsert(programToRow(program, userId))
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
 * Hydrate les programmes : priorité Supabase ; si vide, pousse le cache local.
 * @returns {{ ok, programs, source? }}
 */
export async function syncMemberProgramsWithSupabase(localPrograms = [], memberId) {
  if (!isSupabaseConfigured() || !memberId) {
    return { ok: true, programs: localPrograms, source: "local" };
  }
  const remote = await fetchMyMemberPrograms();
  if (!remote.ok) {
    return { ok: false, programs: localPrograms, error: remote.error };
  }
  if (remote.programs.length > 0) {
    return { ok: true, programs: remote.programs, source: "remote" };
  }
  const mine = (localPrograms || []).filter(
    (p) => p.userId === memberId || !p.userId
  );
  if (mine.length > 0) {
    await Promise.all(
      mine.map((p) =>
        upsertMemberProgram({ ...p, userId: memberId }).catch(() => {})
      )
    );
    return { ok: true, programs: mine.map((p) => ({ ...p, userId: memberId })), source: "pushed" };
  }
  return { ok: true, programs: [], source: "empty" };
}
