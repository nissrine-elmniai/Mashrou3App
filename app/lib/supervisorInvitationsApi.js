import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { ROLES } from "../constants/roles";
import { authEmailForRole, canonicalEmail } from "./authEmail";
import { findActiveSeanceByName } from "./seancesApi";

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
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/duplicate key|23505/i.test(msg)) {
    return "دعوة نشطة موجودة مسبقاً لهذا البريد — راجع قائمة المشرفين";
  }
  return mapSupabaseAuthError(error);
}

/** Id du membre connecté via la session Supabase, ou null. */
async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/** Id d'invitation généré côté client, même pattern que member_applications. */
function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function profileIsSupervisor(profile) {
  if (!profile) return false;
  if (profile.role === ROLES.SUPERVISOR) return true;
  return Array.isArray(profile.roles) && profile.roles.includes(ROLES.SUPERVISOR);
}

async function findSupervisorProfileByInvitationEmail(mail) {
  const canonical = canonicalEmail(mail);
  if (!canonical) return null;
  const supervisorAuthMail = authEmailForRole(canonical, ROLES.SUPERVISOR);

  const queries = [
    supabase
      .from("profiles")
      .select("id, email, canonical_email, role, roles")
      .eq("canonical_email", canonical),
    supabase
      .from("profiles")
      .select("id, email, canonical_email, role, roles")
      .eq("email", canonical),
  ];
  if (supervisorAuthMail !== canonical) {
    queries.push(
      supabase
        .from("profiles")
        .select("id, email, canonical_email, role, roles")
        .eq("email", supervisorAuthMail)
    );
  }

  for (const query of queries) {
    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "البحث عن المشرف"
    );
    if (error) continue;
    const match = (data || []).find(profileIsSupervisor);
    if (match) return match;
  }
  return null;
}

/**
 * (Admin) Rattache la séance de l'invitation au profil superviseur (RPC 0032).
 * @returns {{ ok, error? }}
 */
export async function assignSupervisorSeanceFromInvitation(profileId, invitationEmail) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const mail = canonicalEmail(invitationEmail);
  if (!profileId || !mail) {
    return { ok: false, error: "بيانات الربط غير مكتملة" };
  }
  try {
    const { error } = await withTimeout(
      supabase.rpc("assign_supervisor_seance_from_invitation", {
        p_profile_id: profileId,
        p_canonical_email: mail,
      }),
      SUPABASE_TIMEOUT_MS,
      "ربط الحصة بالمشرف"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "seances") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Tente de rattacher les séances pour tous les superviseurs existants.
 * @returns {{ ok }}
 */
export async function syncSupervisorSeanceLinks(supervisors = []) {
  if (!isSupabaseConfigured() || !supervisors.length) {
    return { ok: true };
  }
  await Promise.all(
    supervisors.map((supervisor) =>
      assignSupervisorSeanceFromInvitation(
        supervisor.id,
        supervisor.canonical_email || supervisor.email
      )
    )
  );
  return { ok: true };
}

/**
 * (Admin) Création d'une invitation superviseur (migration 0013).
 * L'index unique partiel (lower(email) where status <> 'revoked') rejette
 * toute seconde invitation « en cours » pour le même email : l'erreur
 * 23505 est traduite en message explicite.
 * @param {object} payload { email, firstName?, lastName?, groupName?, seanceId? }
 * @returns { ok, invitation? }
 */
export async function createSupervisorInvitation({
  email,
  firstName,
  lastName,
  groupName,
  seanceId = null,
}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const mail = String(email || "").trim().toLowerCase();
  if (!mail || !mail.includes("@")) {
    return { ok: false, error: "أدخل بريداً إلكترونياً صالحاً" };
  }
  if (!String(firstName || "").trim() || !String(lastName || "").trim()) {
    return { ok: false, error: "أدخل اسم المشرف ولقبه" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const cleanGroupName = String(groupName || "").trim();
  let resolvedSeanceId = seanceId || null;
  if (!resolvedSeanceId && cleanGroupName) {
    const lookup = await findActiveSeanceByName(cleanGroupName);
    if (!lookup.ok) {
      return { ok: false, error: lookup.error };
    }
    resolvedSeanceId = lookup.seance?.id || null;
  }

  const row = {
    id: uid("sinv"),
    email: mail,
    first_name: String(firstName).trim(),
    last_name: String(lastName).trim(),
    group_name: cleanGroupName || null,
    seance_id: resolvedSeanceId,
    status: "pending",
    created_by: userId,
  };

  try {
    const { data, error } = await withTimeout(
      supabase.from("supervisor_invitations").insert(row).select("*").single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ دعوة المشرف"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "supervisor_invitations") };
    }

    const existingProfile = await findSupervisorProfileByInvitationEmail(mail);
    if (existingProfile) {
      await assignSupervisorSeanceFromInvitation(existingProfile.id, mail);
    }

    return { ok: true, invitation: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Liste des invitations superviseurs, plus récentes d'abord.
 * @returns { ok, invitations }
 */
export async function listSupervisorInvitations() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("supervisor_invitations")
        .select("*")
        .order("created_at", { ascending: false }),
      SUPABASE_TIMEOUT_MS,
      "قراءة دعوات المشرفين"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "supervisor_invitations") };
    }
    return { ok: true, invitations: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Révocation d'une invitation non activée : status -> 'revoked'.
 * Libère l'email (l'index unique partiel exclut les revoked) pour une
 * ré-invitation ultérieure.
 * @param {string} invitationId
 * @returns { ok, invitation? }
 */
export async function revokeSupervisorInvitation(invitationId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!invitationId) {
    return { ok: false, error: "معرّف الدعوة مفقود" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("supervisor_invitations")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", invitationId)
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "إلغاء الدعوة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "supervisor_invitations") };
    }
    return { ok: true, invitation: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Suppression réelle d'un compte superviseur/membre activé via
 * l'Edge Function delete-user (déployée SANS --no-verify-jwt : le rôle
 * admin est vérifié côté serveur). La suppression de l'utilisateur Auth
 * cascade sur profiles et les tables liées.
 * @param {string} userId UUID du compte auth.users / profiles
 * @returns { ok }
 */
export async function deleteSupervisorAccount({ userId }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!userId) {
    return { ok: false, error: "معرّف المستخدم مفقود" };
  }

  try {
    const invokePromise = supabase.functions.invoke("delete-user", {
      body: { userId },
    });
    const { data, error } = await withTimeout(
      invokePromise,
      SUPABASE_TIMEOUT_MS,
      "حذف الحساب"
    );

    if (error) {
      const msg = error.message || "";
      if (/not found|404|FunctionsRelayError/i.test(msg)) {
        return {
          ok: false,
          error:
            "دالة الحذف غير منشورة بعد. انشرها عبر: supabase functions deploy delete-user",
        };
      }
      return { ok: false, error: msg || "فشل استدعاء خدمة الحذف" };
    }

    if (data && data.ok === false) {
      return { ok: false, error: data.error || "فشل حذف الحساب" };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
