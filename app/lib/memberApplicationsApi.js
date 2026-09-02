import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { REGISTRATION_STATUS } from "../constants/roles";

const SUPABASE_TIMEOUT_MS = 15000;

function mapStatus(status) {
  if (status === REGISTRATION_STATUS.ACCEPTED) return "invited";
  if (status === REGISTRATION_STATUS.INVITED) return "invited";
  if (status === REGISTRATION_STATUS.ACTIVATED) return "activated";
  if (status === REGISTRATION_STATUS.REJECTED) return "rejected";
  return "pending";
}

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

/** Soumission publique d'une demande en attente (sans compte) */
export async function insertPendingMemberApplication(reg) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }
  if (!reg?.id || !reg?.email) {
    return { ok: false, error: "بيانات الطلب غير مكتملة" };
  }

  const now = new Date().toISOString();
  const row = {
    id: String(reg.id),
    email: String(reg.email).trim().toLowerCase(),
    full_name: reg.fullName || null,
    first_name: reg.firstName || null,
    last_name: reg.lastName || null,
    phone: reg.phone || null,
    school: reg.school || null,
    level: reg.level || null,
    hifz_amount: reg.hifzAmount || null,
    season_id: reg.seasonId || null,
    seance_id: reg.seanceId || null,
    requested_seance_name: reg.seanceName || reg.requestedSeanceName || null,
    genre: reg.gender || reg.genre || null,
    status: "pending",
    created_at: now,
    updated_at: now,
  };

  try {
    const { data, error } = await withTimeout(
      supabase.from("member_applications").insert(row).select("*").single(),
      SUPABASE_TIMEOUT_MS,
      "إرسال طلب الانضمام"
    );
    if (error) {
      const msg = error.message || "";
      if (/duplicate key|23505/i.test(msg)) {
        return { ok: false, error: "لديك طلب تسجيل مسبقاً بهذا البريد" };
      }
      if (/relation.*does not exist|Could not find the table/i.test(msg)) {
        return {
          ok: false,
          error:
            "جدول member_applications غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor",
        };
      }
      return { ok: false, error: mapSupabaseAuthError(error) };
    }
    return { ok: true, application: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Upsert d'une demande après validation / rejet admin */
export async function upsertMemberApplication(reg, status) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }
  if (!reg?.id || !reg?.email) {
    return { ok: false, error: "بيانات الطلب غير مكتملة" };
  }

  const mapped = mapStatus(status);
  const now = new Date().toISOString();
  const row = {
    id: String(reg.id),
    email: String(reg.email).trim().toLowerCase(),
    full_name: reg.fullName || null,
    first_name: reg.firstName || null,
    last_name: reg.lastName || null,
    phone: reg.phone || null,
    school: reg.school || null,
    level: reg.level || null,
    hifz_amount: reg.hifzAmount || null,
    season_id: reg.seasonId || null,
    seance_id: reg.seanceId || null,
    requested_seance_name: reg.seanceName || reg.requestedSeanceName || null,
    genre: reg.gender || reg.genre || null,
    status: mapped,
    updated_at: now,
  };

  if (mapped === "invited") {
    row.accepted_at = now;
  }
  if (mapped === "rejected") {
    row.rejected_at = now;
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("member_applications")
        .upsert(row, { onConflict: "id" })
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ الطلب في Supabase"
    );

    if (error) {
      const msg = error.message || "";
      if (/relation.*does not exist|Could not find the table/i.test(msg)) {
        return {
          ok: false,
          error:
            "جدول member_applications غير موجود — نفّذ ملف supabase/member_applications.sql في SQL Editor",
        };
      }
      if (/permission|row-level security|RLS|42501/i.test(msg)) {
        return {
          ok: false,
          error: "لا صلاحية للكتابة — سجّل دخول الأدمن عبر Supabase ثم أعد المحاولة",
        };
      }
      return { ok: false, error: mapSupabaseAuthError(error) };
    }
    return { ok: true, application: data };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
    };
  }
}

/**
 * (Admin) Nombre de demandes d'inscription en attente (statistiques).
 * @returns { ok, count }
 */
export async function countPendingApplications() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { count, error } = await withTimeout(
      supabase
        .from("member_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      SUPABASE_TIMEOUT_MS,
      "قراءة الطلبات المعلقة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "member_applications") };
    }
    return { ok: true, count: count || 0 };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Lie la demande au compte Auth après création du mot de passe */
export async function markMemberApplicationActivated({ email, userId }) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }
  const mail = String(email || "").trim().toLowerCase();
  if (!mail || !userId) {
    return { ok: false, error: "بيانات التفعيل غير مكتملة" };
  }

  const now = new Date().toISOString();
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("member_applications")
        .update({
          status: "activated",
          user_id: userId,
          activated_at: now,
          updated_at: now,
        })
        .eq("email", mail)
        .in("status", ["invited", "pending"])
        .select("*"),
      SUPABASE_TIMEOUT_MS,
      "تحديث حالة الطلب"
    );

    if (error) {
      return { ok: false, error: mapSupabaseAuthError(error) };
    }
    return { ok: true, applications: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر تحديث الطلب" };
  }
}
