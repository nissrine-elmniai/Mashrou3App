import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { ROLES } from "../constants/roles";
import { authEmailForRole, canonicalEmail } from "./authEmail";
import { findActiveSeanceByName, assignOrSwapSeanceSuperviseur, listSupervisorSeances } from "./seancesApi";
import { parseEdgeFunctionError } from "./edgeFunctionError";

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
  if (/get_pending_supervisor_invitation|Could not find the function/i.test(msg)) {
    return "دالة الدعوة غير موجودة — نفّذ ملف supabase/migrations/0025_supervisor_invitation_public_lookup.sql";
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
 * (Admin) Désactive les superviseurs des saisons clôturées (RPC 0065).
 * Les lignes profiles restent (historique) ; le login est bloqué.
 * @param {string[]} saisonIds
 * @returns {{ ok, count?, error?, skipped? }}
 */
export async function deactivateSupervisorsForSaisons(saisonIds = []) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true, count: 0 };
  }
  const ids = [...new Set((saisonIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true, count: 0 };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc("deactivate_supervisors_for_saisons", {
        p_saison_ids: ids,
      }),
      SUPABASE_TIMEOUT_MS,
      "تعطيل مشرفي المواسم السابقة"
    );
    if (error) {
      const msg = error.message || "";
      if (/Could not find the function|deactivate_supervisors_for_saisons/i.test(msg)) {
        return {
          ok: false,
          error:
            "دالة تعطيل المشرفين غير موجودة — نفّذ supabase/migrations/0065_profiles_account_status_inactive.sql",
        };
      }
      return { ok: false, error: mapTableError(error, "profiles") };
    }
    return { ok: true, count: Number(data) || 0 };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر تعطيل المشرفين" };
  }
}

/**
 * (Admin) Réactive un profil superviseur pour la nouvelle saison.
 * @param {string} profileId
 * @returns {{ ok, error?, skipped? }}
 */
export async function reactivateSupervisorProfile(profileId) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }
  if (!profileId) {
    return { ok: false, error: "معرّف المشرف مفقود" };
  }
  try {
    const { error } = await withTimeout(
      supabase.rpc("reactivate_supervisor_profile", {
        p_profile_id: profileId,
      }),
      SUPABASE_TIMEOUT_MS,
      "إعادة تفعيل المشرف"
    );
    if (error) {
      const msg = error.message || "";
      if (/Could not find the function|reactivate_supervisor_profile/i.test(msg)) {
        return {
          ok: false,
          error:
            "دالة إعادة التفعيل غير موجودة — نفّذ supabase/migrations/0065_profiles_account_status_inactive.sql",
        };
      }
      return { ok: false, error: mapTableError(error, "profiles") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر إعادة تفعيل المشرف" };
  }
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
 * @param {object} payload { email, firstName?, lastName?, groupName?, seanceId?, saisonId? }
 * @returns { ok, invitation? }
 */
export async function createSupervisorInvitation({
  email,
  firstName,
  lastName,
  groupName,
  seanceId = null,
  saisonId = null,
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
    const lookup = await findActiveSeanceByName(cleanGroupName, saisonId);
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
    saison_id: saisonId || null,
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
      await reactivateSupervisorProfile(existingProfile.id);
      await assignSupervisorSeanceFromInvitation(existingProfile.id, mail);
    }

    return { ok: true, invitation: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Liste des invitations superviseurs, plus récentes d'abord.
 * @param {{ saisonId?: string }} options
 * @returns { ok, invitations }
 */
export async function listSupervisorInvitations({ saisonId = null } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    let query = supabase
      .from("supervisor_invitations")
      .select("*")
      .order("created_at", { ascending: false });
    if (saisonId) {
      query = query.or(`saison_id.is.null,saison_id.eq.${saisonId}`);
    }
    const { data, error } = await withTimeout(
      query,
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
 * (Public / anon) Invitation superviseur en attente pour cet e-mail.
 * RPC security definer (migration 0025) : sans elle, RLS admin-only
 * empêche l'invité de vérifier sa invitation avant signUp.
 * @param {string} email
 * @returns {{ ok: boolean, invitation?: object|null, error?: string }}
 */
export async function getPendingSupervisorInvitation(email) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const mail = canonicalEmail(email);
  if (!mail) {
    return { ok: false, error: "أدخل البريد الإلكتروني" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc("get_pending_supervisor_invitation", { p_email: mail }),
      SUPABASE_TIMEOUT_MS,
      "البحث عن دعوة المشرف"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "supervisor_invitations") };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, invitation: row || null };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

const SEANCE_REASSIGN_HINT =
  "عيّن مشرفاً آخر من صفحة المواسم، ثم أعد الحذف.";

function mapDeleteAccountError(raw) {
  const msg = String(raw || "");
  if (
    /superviseur_id/i.test(msg) &&
    /not-null|null value|foreign key|23502|23503/i.test(msg)
  ) {
    return `لا يمكن حذف هذا المشرف لأنه مرتبط بحصة. ${SEANCE_REASSIGN_HINT}`;
  }
  return msg || "فشل حذف الحساب";
}

/**
 * (Admin) Réaffecte la séance courante à un superviseur libre, puis retire
 * l'ancien du roster. Aucune séance active ne reste sans responsable.
 * Un profil encore cité par une séance archivée est désactivé (historique
 * conservé). Un profil sans aucune séance est supprimé physiquement.
 * @returns {{ ok: boolean, error?: string, mode?: 'deleted'|'retired' }}
 */
export async function reassignAndRemoveSupervisor({
  userId,
  seanceId = null,
  replacementId = null,
}) {
  if (!userId) {
    return { ok: false, error: "معرّف المشرف مفقود" };
  }
  if (seanceId && !replacementId) {
    return { ok: false, error: "اختر مشرفاً آخر قبل الحذف" };
  }
  if (replacementId && replacementId === userId) {
    return { ok: false, error: "اختر مشرفاً مختلفاً" };
  }

  if (seanceId && replacementId) {
    const assigned = await assignOrSwapSeanceSuperviseur(seanceId, replacementId);
    if (!assigned.ok) return assigned;
    if (assigned.result?.action === "swap") {
      await assignOrSwapSeanceSuperviseur(seanceId, userId);
      return {
        ok: false,
        error: "المشرف المختار مرتبط بحصة أخرى. اختر مشرفاً غير مكلّف.",
      };
    }
  }

  const linksRes = await listSupervisorSeances(userId);
  if (!linksRes.ok) return { ok: false, error: linksRes.error };
  const open = (linksRes.seances || []).filter((row) => row.statut !== "archivee");
  if (open.length) {
    return {
      ok: false,
      error: "ما زال هذا المشرف مرتبطاً بحصة. أعد الإسناد قبل الحذف.",
    };
  }
  if ((linksRes.seances || []).length === 0) {
    const removed = await deleteSupervisorAccount({ userId });
    if (!removed.ok) return removed;
    return { ok: true, mode: "deleted" };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { error } = await withTimeout(
      supabase.rpc("retire_supervisor_profile", { p_profile_id: userId }),
      SUPABASE_TIMEOUT_MS,
      "تعطيل المشرف"
    );
    if (error) {
      const msg = error.message || "";
      if (/AFFECTATION_ACTIVE/.test(msg)) {
        return {
          ok: false,
          error: "ما زال هذا المشرف مرتبطاً بحصة نشطة. أعد الإسناد قبل الحذف.",
        };
      }
      if (/Could not find the function|retire_supervisor_profile/i.test(msg)) {
        return {
          ok: false,
          error: "دالة سحب المشرف غير موجودة. نفّذ الهجرة 0090 في SQL Editor.",
        };
      }
      return { ok: false, error: mapTableError(error, "profiles") };
    }
    return { ok: true, mode: "retired" };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر سحب المشرف" };
  }
}

/**
 * (Admin) Suppression réelle d'un compte superviseur/membre activé via
 * l'Edge Function delete-user (déployée SANS --no-verify-jwt : le rôle
 * admin est vérifié côté serveur). La suppression de l'utilisateur Auth
 * cascade sur profiles et les tables liées.
 * Une séance a superviseur_id NOT NULL : le compte ne peut pas être
 * supprimé tant qu'une séance le référence (ON DELETE SET NULL échoue).
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
      const parsed = await parseEdgeFunctionError(error, "فشل استدعاء خدمة الحذف", {
        functionName: "delete-user",
      });
      return { ok: false, error: mapDeleteAccountError(parsed) };
    }

    if (data && data.ok === false) {
      return { ok: false, error: mapDeleteAccountError(data.error) };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
