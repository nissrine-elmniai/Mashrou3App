import { supabase, mapSupabaseAuthError, isSupabaseConfigured } from "./supabase";
import { ACCOUNT_STATUS, ROLES } from "../constants/roles";
import { canonicalEmail } from "./authEmail";
import { formatGenderLabel } from "./membersApi";
import { markMemberApplicationActivated } from "./memberApplicationsApi";

export { isSupabaseConfigured };

/** Alias legacy (seed SQL français, metadata Auth) → constantes ROLES JS / profiles.role SQL. */
const ROLE_ALIASES = {
  admin: ROLES.ADMIN,
  administrateur: ROLES.ADMIN,
  supervisor: ROLES.SUPERVISOR,
  superviseur: ROLES.SUPERVISOR,
  member: ROLES.MEMBER,
  membre: ROLES.MEMBER,
};

/**
 * Normalise profiles.role (ou toute valeur brute) vers ROLES.ADMIN | SUPERVISOR | MEMBER.
 * Point d'entrée unique pour éviter les comparaisons strictes qui échouent (casse, FR/EN).
 */
export function normalizeAppRole(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return ROLE_ALIASES[key] || null;
}

/**
 * URL d'avatar du cache local, acceptée seulement si elle vise bien le
 * fichier {authId}.jpg du compte courant. Un compte supprimé puis recréé
 * (même e-mail, nouvel auth id) ne doit pas hériter de l'ancienne photo.
 */
function fallbackAvatarForAuthId(authId, fallbackUrl) {
  if (!authId || !fallbackUrl) return null;
  const url = String(fallbackUrl);
  return url.includes(`/avatars/${authId}`) ? url : null;
}

export function profileToAppUser(profile, fallback = {}) {
  const roleFromProfile = normalizeAppRole(profile?.role);
  const roleFromFallback = normalizeAppRole(fallback?.role);
  return {
    id: fallback.id || profile.id,
    authId: profile.id,
    email: (profile.email || fallback.email || "").toLowerCase(),
    password: null,
    firstName: profile.first_name || fallback.firstName || "",
    lastName: profile.last_name || fallback.lastName || "",
    birthDate:
      toSlashDate(profile?.date_naissance) ||
      fallback.birthDate ||
      null,
    gender:
      formatGenderLabel(profile?.genre) ||
      formatGenderLabel(fallback.gender) ||
      "غير محدد",
    role: roleFromProfile || roleFromFallback || ROLES.MEMBER,
    accountStatus: profile.account_status ?? fallback.accountStatus ?? null,
    seasonId: fallback.seasonId || null,
    school: fallback.school,
    level: fallback.level,
    phone: profile.phone ?? fallback.phone,
    hifzAmount: profile.hifz_amount || fallback.hifzAmount || "",
    avatarUrl:
      profile.avatar_url ||
      fallbackAvatarForAuthId(profile.id, fallback.avatarUrl) ||
      null,
  };
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    return { ok: false, error: mapSupabaseAuthError(error) };
  }
  if (!data) {
    return { ok: false, error: "لم يُعثر على ملف المستخدم" };
  }
  return { ok: true, profile: data };
}

/**
 * Ligne legacy `public.users` (nom, prenom, telephone, role FR).
 * Absente sur certaines bases — retourne user: null sans erreur.
 */
export async function fetchAppUserRow(userId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!userId) {
    return { ok: false, error: "معرّف المستخدم مفقود" };
  }
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    const msg = error?.message || "";
    if (/relation.*does not exist|Could not find the table/i.test(msg)) {
      return { ok: true, user: null };
    }
    return { ok: false, error: mapSupabaseAuthError(error) };
  }
  return { ok: true, user: data || null };
}

function pickProfileText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const SLASH_DATE_RE = /^(\d{4})\/(\d{2})\/(\d{2})$/;

/** Normalise YYYY-MM-DD, YYYY/MM/DD ou timestamp ISO vers YYYY-MM-DD. */
export function toIsoDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const slash = text.match(SLASH_DATE_RE);
  if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`;
  const iso = text.match(ISO_DATE_RE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

export function toSlashDate(value) {
  const iso = toIsoDate(value);
  return iso ? iso.replace(/-/g, "/") : null;
}

export function parseLocalDate(value) {
  const iso = toIsoDate(value);
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isPlaceholderBirthDate(value) {
  const iso = toIsoDate(value);
  return iso === "2000-01-01";
}

export function formatBirthDateLabel(value) {
  if (isPlaceholderBirthDate(value)) return null;
  const date = parseLocalDate(value);
  if (!date) return null;
  return date.toLocaleDateString("ar-MA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function dateToIsoLocal(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function mapProfilesWriteError(error) {
  const msg = error?.message || "";
  const code = String(error?.code || "");
  if (
    code === "42501" ||
    /permission|row-level security|RLS|42501|violates row/i.test(msg)
  ) {
    return "تعذّر حفظ التعديلات";
  }
  if (/column.*date_naissance.*does not exist/i.test(msg)) {
    return "عمود تاريخ الميلاد مفقود — نفّذ supabase/migrations/0056_profiles_date_naissance.sql في SQL Editor";
  }
  if (/column.*does not exist/i.test(msg)) {
    return "عمود مفقود في profiles — راجع migrations Supabase";
  }
  return mapSupabaseAuthError(error) || "تعذر حفظ التعديلات";
}

/**
 * Mise à jour du profil par le titulaire (profiles_update_own).
 * Colonnes envoyées uniquement si présentes dans `fields` :
 * first_name, last_name (toujours), phone / genre / date_naissance (optionnels).
 * Jamais email, canonical_email, account_status, created_at, role, roles.
 * Recopie best-effort vers public.users (legacy) si la table existe.
 */
export async function updateOwnProfile(userId, fields = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!userId) {
    return { ok: false, error: "تعذر تحديد حسابك — أعد تسجيل الدخول" };
  }

  const firstName = pickProfileText(fields.firstName);
  const lastName = pickProfileText(fields.lastName);
  const hasPhone = "phone" in fields;
  const hasBirthDate = "birthDate" in fields;
  const hasGenre = "genre" in fields;
  const phone = hasPhone ? pickProfileText(fields.phone) : undefined;
  const genre = hasGenre ? formatGenderLabel(fields.genre) : null;
  const birthDate = hasBirthDate ? toIsoDate(fields.birthDate) : null;

  if (!firstName || !lastName) {
    return { ok: false, error: "أدخل الاسم الأول والنسب" };
  }
  if (hasBirthDate && !birthDate) {
    return { ok: false, error: "أدخل تاريخ الميلاد" };
  }

  const payload = {
    first_name: firstName,
    last_name: lastName,
    updated_at: new Date().toISOString(),
  };
  if (hasPhone) {
    payload.phone = phone;
  }
  if (hasBirthDate) {
    payload.date_naissance = birthDate;
  }
  if (genre === "ذكر" || genre === "أنثى") {
    payload.genre = genre;
  }

  const writeProfile = async (body) =>
    supabase
      .from("profiles")
      .update(body)
      .eq("id", userId)
      .select("*")
      .maybeSingle();

  try {
    let { data, error } = await writeProfile(payload);
    if (error && payload.genre && /column.*genre.*does not exist/i.test(error.message || "")) {
      const { genre: _ignored, ...withoutGenre } = payload;
      ({ data, error } = await writeProfile(withoutGenre));
    }
    if (error) {
      return { ok: false, error: mapProfilesWriteError(error) };
    }
    // RLS qui bloque sans lever d'erreur : 0 ligne renvoyée par .select()
    if (!data) {
      return { ok: false, error: "تعذّر حفظ التعديلات" };
    }

    try {
      const usersPatch = {
        nom: lastName,
        prenom: firstName,
      };
      if (hasPhone) {
        usersPatch.telephone = phone;
      }
      await supabase.from("users").update(usersPatch).eq("id", userId);
    } catch {
      /* table users absente ou RLS — profiles reste la source de vérité */
    }

    return { ok: true, profile: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export async function upsertProfile({
  id,
  email,
  role,
  accountStatus = ACCOUNT_STATUS.ACTIVE,
  firstName,
  lastName,
}) {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id,
        email: String(email || "").toLowerCase(),
        role,
        account_status: accountStatus,
        first_name: firstName || null,
        last_name: lastName || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) {
    return { ok: false, error: mapSupabaseAuthError(error) };
  }
  return { ok: true, profile: data };
}

export async function signInWithEmailPassword(email, password) {
  const mail = String(email || "").trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: mail,
    password,
  });
  if (error) {
    return { ok: false, error: mapSupabaseAuthError(error) };
  }
  const profileResult = await fetchProfile(data.user.id);
  if (!profileResult.ok) {
    // Session Auth ok mais pas de profil → créer un profil minimal
    const meta = data.user.user_metadata || {};
    const created = await upsertProfile({
      id: data.user.id,
      email: mail,
      role: normalizeAppRole(meta.role) || ROLES.MEMBER,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      firstName: meta.first_name || "",
      lastName: meta.last_name || "",
    });
    if (!created.ok) return created;
    return {
      ok: true,
      session: data.session,
      authUser: data.user,
      profile: created.profile,
    };
  }
  if (profileResult.profile.account_status === ACCOUNT_STATUS.INVITED) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "الحساب غير مفعّل بعد — أنشئ كلمة المرور من شاشة إنشاء الحساب",
    };
  }
  return {
    ok: true,
    session: data.session,
    authUser: data.user,
    profile: profileResult.profile,
  };
}

/**
 * Crée / active un compte invité via Edge Function (service role + email_confirm).
 * Évite auth.signUp qui dépend du SMTP Auth (souvent en panne).
 */
export async function activateInvitedAuthAccount({
  email,
  password,
  role,
  firstName,
  lastName,
}) {
  const mail = String(email || "").trim().toLowerCase();
  try {
    const { data, error } = await supabase.functions.invoke(
      "activate-invited-account",
      {
        body: {
          email: mail,
          password,
          role,
          firstName: firstName || "",
          lastName: lastName || "",
        },
      }
    );

    // Corps JSON même si HTTP non-2xx (Supabase met souvent l'erreur dans error.context)
    let payload = data;
    if ((!payload || payload.ok === undefined) && error?.context) {
      try {
        const ctx = error.context;
        if (typeof ctx.json === "function") {
          payload = await ctx.json();
        } else if (typeof ctx.text === "function") {
          const text = await ctx.text();
          payload = text ? JSON.parse(text) : null;
        }
      } catch {
        /* ignore */
      }
    }

    if (payload && payload.ok === false) {
      return { ok: false, error: payload.error || "تعذر إنشاء الحساب" };
    }

    if (payload?.ok === true && payload?.authUser?.id) {
      return {
        ok: true,
        authUser: payload.authUser,
        profile: payload.profile || null,
        needsEmailConfirmation: false,
      };
    }

    if (error) {
      const msg = error.message || "";
      const status = error.context?.status || error.status;
      if (
        status === 404 ||
        /not found|FunctionsFetchError|Failed to send|relay error/i.test(msg)
      ) {
        // 404 HTTP peut aussi être « pas d'invitation » — message déjà extrait ci-dessus
        if (/non-2xx|Edge Function/i.test(msg)) {
          return {
            ok: false,
            error:
              "تعذر إنشاء الحساب. تأكد أن الإدارة قبلت طلبك بهذا البريد ثم أعد المحاولة.",
          };
        }
        return {
          ok: false,
          functionMissing: true,
          error:
            "دالة activate-invited-account غير منشورة — أعد نشرها من لوحة Supabase",
        };
      }
      return {
        ok: false,
        error:
          msg ||
          "تعذر إنشاء الحساب. تحقق من نشر الدالة activate-invited-account.",
      };
    }

    return { ok: false, error: "تعذر إنشاء الحساب" };
  } catch (e) {
    return {
      ok: false,
      functionMissing: true,
      error: e?.message || "تعذر الاتصال بخدمة إنشاء الحساب",
    };
  }
}

export async function signUpWithProfile({
  email,
  password,
  role,
  firstName,
  lastName,
  accountStatus = ACCOUNT_STATUS.ACTIVE,
  signOutAfter = true,
}) {
  // Activation d'invité : Edge Function (createUser + email_confirm) pour éviter
  // l'échec SMTP de auth.signUp (« تعذر إرسال بريد التأكيد »).
  if (role === ROLES.MEMBER || role === ROLES.SUPERVISOR) {
    const invited = await activateInvitedAuthAccount({
      email,
      password,
      role,
      firstName,
      lastName,
    });
    if (!invited.functionMissing) {
      return invited;
    }
    // Fonction non déployée : repli temporaire sur signUp (nécessite SMTP OK)
  }

  const mail = String(email || "").trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: mail,
    password,
    options: {
      data: {
        role,
        first_name: firstName || "",
        last_name: lastName || "",
        account_status: accountStatus,
        canonical_email: canonicalEmail(mail),
      },
    },
  });

  if (error) {
    if (/already registered|already been registered/i.test(error.message || "")) {
      if (role === ROLES.MEMBER) {
        return {
          ok: false,
          error:
            "هذا البريد لحساب موجود مسبقاً (مشرف أو إدارة). حساب المشرف ليس حساب عضو — استخدم بريداً آخر لإنشاء حساب العضو.",
        };
      }
      // Même rôle : réactivation éventuelle si le mot de passe correspond
      const signedIn = await signInWithEmailPassword(mail, password);
      if (!signedIn.ok) {
        return {
          ok: false,
          error:
            "هذا البريد مسجّل مسبقاً. سجّل الدخول أو استخدم استعادة كلمة المرور",
        };
      }
      const existingRole = signedIn.profile?.role;
      if (existingRole && existingRole !== role) {
        await supabase.auth.signOut();
        return {
          ok: false,
          error:
            "هذا البريد مرتبط بدور آخر. استخدم بريداً مختلفاً لهذا الحساب.",
        };
      }
      const updated = await upsertProfile({
        id: signedIn.authUser.id,
        email: mail,
        role,
        accountStatus,
        firstName,
        lastName,
      });
      if (!updated.ok) return updated;
      await supabase.auth.signOut();
      return {
        ok: true,
        authUser: signedIn.authUser,
        profile: updated.profile,
        existing: true,
      };
    }
    return { ok: false, error: mapSupabaseAuthError(error) };
  }

  if (!data.user) {
    return { ok: false, error: "تعذر إنشاء الحساب" };
  }

  // Le trigger SQL crée souvent le profil ; on force un upsert pour le rôle
  const profileResult = await upsertProfile({
    id: data.user.id,
    email: mail,
    role,
    accountStatus,
    firstName,
    lastName,
  });

  // Lier la demande d'inscription (si existante) tant que la session signup est active
  let linkWarning = null;
  if (data.session && role === ROLES.MEMBER) {
    const linked = await markMemberApplicationActivated({
      email: mail,
      userId: data.user.id,
    });
    if (!linked.ok && !linked.skipped) {
      linkWarning = linked.error || "تعذر ربط طلب الانضمام";
    }
  }

  // Ne pas laisser une session "signup" ouverte : l'utilisateur se connecte ensuite
  if (data.session) {
    await supabase.auth.signOut();
  }

  if (!profileResult.ok) {
    // Auth créé mais profil KO — on laisse quand même le compte Auth
    return {
      ok: true,
      authUser: data.user,
      profile: null,
      warning: profileResult.error || linkWarning,
      needsEmailConfirmation: !data.session,
    };
  }

  return {
    ok: true,
    authUser: data.user,
    profile: profileResult.profile,
    needsEmailConfirmation: !data.session,
    warning: linkWarning || undefined,
  };
}

export async function signOutAuth() {
  if (!isSupabaseConfigured()) return { ok: true };
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: mapSupabaseAuthError(error) };
  return { ok: true };
}

export async function requestPasswordReset(email) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail) return { ok: false, error: "أدخل البريد الإلكتروني" };

  // Envoi via Edge Function + Resend API (évite le SMTP Auth souvent en panne)
  const { data, error } = await supabase.functions.invoke("send-password-reset", {
    body: { email: mail },
  });

  if (error) {
    return {
      ok: false,
      error:
        error.message ||
        "تعذر إرسال رمز الاستعادة. تحقق من نشر الدالة send-password-reset.",
    };
  }
  if (data && data.ok === false) {
    return { ok: false, error: data.error || "فشل إرسال رمز الاستعادة" };
  }
  return { ok: true };
}

/** Vérifie le code reçu par e-mail puis définit le nouveau mot de passe */
export async function confirmPasswordResetWithOtp(email, token, newPassword) {
  const mail = String(email || "").trim().toLowerCase();
  const code = String(token || "").trim();
  if (!mail) return { ok: false, error: "أدخل البريد الإلكتروني" };
  if (!code) return { ok: false, error: "أدخل رمز التحقق" };
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: "كلمة المرور قصيرة جداً (6 أحرف على الأقل)" };
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: mail,
    token: code,
    type: "recovery",
  });
  if (verifyError) {
    return { ok: false, error: mapSupabaseAuthError(verifyError) };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    return { ok: false, error: mapSupabaseAuthError(updateError) };
  }

  await supabase.auth.signOut();
  return { ok: true };
}

export async function getCurrentAuthSession() {
  if (!isSupabaseConfigured()) return { ok: true, session: null };
  const { data, error } = await supabase.auth.getSession();
  if (error) return { ok: false, error: mapSupabaseAuthError(error), session: null };
  return { ok: true, session: data.session };
}
