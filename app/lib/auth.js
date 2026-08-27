import { supabase, mapSupabaseAuthError, isSupabaseConfigured } from "./supabase";
import { ACCOUNT_STATUS, ROLES } from "../constants/roles";

export { isSupabaseConfigured };

export function profileToAppUser(profile, fallback = {}) {
  return {
    id: fallback.id || profile.id,
    authId: profile.id,
    email: (profile.email || fallback.email || "").toLowerCase(),
    password: null,
    firstName: profile.first_name || fallback.firstName || "",
    lastName: profile.last_name || fallback.lastName || "",
    birthDate: fallback.birthDate || "2000/01/01",
    gender: fallback.gender || "غير محدد",
    role: profile.role || fallback.role || ROLES.MEMBER,
    accountStatus:
      profile.account_status || fallback.accountStatus || ACCOUNT_STATUS.ACTIVE,
    seasonId: fallback.seasonId || null,
    school: fallback.school,
    level: fallback.level,
    phone: fallback.phone,
    hifzAmount: fallback.hifzAmount,
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
      role: meta.role || ROLES.MEMBER,
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

export async function signUpWithProfile({
  email,
  password,
  role,
  firstName,
  lastName,
  accountStatus = ACCOUNT_STATUS.ACTIVE,
  signOutAfter = true,
}) {
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
  if (data.session && role === ROLES.MEMBER) {
    await supabase
      .from("member_applications")
      .update({
        status: "activated",
        user_id: data.user.id,
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("email", mail)
      .in("status", ["invited", "pending"]);
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
      warning: profileResult.error,
      needsEmailConfirmation: !data.session,
    };
  }

  return {
    ok: true,
    authUser: data.user,
    profile: profileResult.profile,
    needsEmailConfirmation: !data.session,
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
