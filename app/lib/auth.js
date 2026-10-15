import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  supabase,
  mapSupabaseAuthError,
  isSupabaseConfigured,
  SUPABASE_URL,
} from "./supabase";
import {
  hasEmailMarker,
  hasTechnicalMarker,
  isArabicText,
  isNetworkError,
} from "./userError";
import { ACCOUNT_STATUS, ROLES } from "../constants/roles";
import { formatGenderLabel } from "./membersApi";
import {
  isPasswordTooShort,
  passwordTooShortMessage,
} from "../constants/security";

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
  if (profileResult.profile.account_status === ACCOUNT_STATUS.INACTIVE) {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة",
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
 * Vérifie le mot de passe du compte déjà connecté.
 * Appelle signInWithPassword directement : signInWithEmailPassword
 * déconnecte les comptes inactive / invited.
 * Ne journalise pas le mot de passe.
 */
export async function verifyCurrentPassword(password) {
  const { data: current, error: currentError } = await supabase.auth.getUser();
  const email = current?.user?.email;
  const currentId = current?.user?.id;
  if (currentError || !email || !currentId) {
    return { ok: false, error: "SESSION_INTROUVABLE" };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data?.session || !data?.user) {
    return {
      ok: false,
      error: error ? mapSupabaseAuthError(error) : "كلمة المرور غير صحيحة",
    };
  }
  if (data.user.id !== currentId) {
    return { ok: false };
  }
  return { ok: true, session: data.session };
}

/**
 * Crée / active un compte invité via Edge Function (service role + email_confirm).
 * Évite auth.signUp qui dépend du SMTP Auth (souvent en panne).
 */
export async function requestActivationCode({ email, role }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const mail = String(email || "").trim().toLowerCase();
  if (!mail || !mail.includes("@")) {
    return { ok: false, error: "أدخل بريداً إلكترونياً صالحاً" };
  }
  if (role !== ROLES.MEMBER && role !== ROLES.SUPERVISOR) {
    return { ok: false, error: "دور غير صالح" };
  }
  try {
    const { data, error } = await supabase.functions.invoke("send-activation-code", {
      body: { email: mail, role },
    });
    const payload = await readFunctionPayload(data, error);
    if (payload?.ok === true) return { ok: true };
    if (payload?.ok === false) {
      return {
        ok: false,
        error: mapSupabaseAuthError({
          message: String(payload.error || "تعذر إرسال الرمز"),
        }),
      };
    }
    if (error) {
      const status = error?.context?.status ?? error?.status;
      return { ok: false, error: mapSupabaseAuthError(error, status) };
    }
    return { ok: false, error: "تعذر إرسال الرمز" };
  } catch (e) {
    return { ok: false, error: mapSupabaseAuthError(e) };
  }
}

async function readFunctionPayload(data, error) {
  let payload = data;
  if ((!payload || payload.ok === undefined) && error?.context) {
    try {
      const ctx = error.context;
      if (typeof ctx.json === "function") payload = await ctx.json();
      else if (typeof ctx.text === "function") {
        const text = await ctx.text();
        payload = text ? JSON.parse(text) : null;
      }
    } catch {
      /* ignore */
    }
  }
  return payload;
}

function isCleanArabicMessage(text) {
  const value = String(text || "");
  return (
    isArabicText(value) &&
    !hasEmailMarker(value) &&
    !hasTechnicalMarker(value)
  );
}

export async function activateInvitedAuthAccount({
  email,
  password,
  role,
  firstName,
  lastName,
  code,
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
          code: String(code || "").trim(),
        },
      }
    );

    // Corps JSON même si HTTP non-2xx (Supabase met souvent l'erreur dans error.context)
    const payload = await readFunctionPayload(data, error);

    if (payload?.ok === true && payload?.authUser?.id) {
      return {
        ok: true,
        authUser: payload.authUser,
        profile: payload.profile || null,
        needsEmailConfirmation: false,
      };
    }

    const status = error?.context?.status ?? error?.status;
    if (error && isNetworkError(error, status)) {
      return { ok: false, error: mapSupabaseAuthError(error, status) };
    }

    const functionText =
      payload && payload.ok === false ? String(payload.error || "") : "";
    if (isCleanArabicMessage(functionText)) {
      return { ok: false, error: functionText };
    }

    if (typeof status === "number" && status >= 500) {
      return {
        ok: false,
        error: mapSupabaseAuthError(error || { status }, status),
      };
    }

    const msg = error?.message || "";
    if (
      error &&
      (status === 404 ||
        /not found|FunctionsFetchError|relay error/i.test(msg)) &&
      /non-2xx|Edge Function/i.test(msg)
    ) {
      return {
        ok: false,
        error:
          "تعذر إنشاء الحساب. تأكد أن الإدارة قبلت طلبك بهذا البريد ثم أعد المحاولة.",
      };
    }

    if (functionText) {
      return {
        ok: false,
        error: mapSupabaseAuthError({ message: functionText }),
      };
    }
    if (error) {
      return { ok: false, error: mapSupabaseAuthError(error, status) };
    }
    return { ok: false, error: "تعذر إنشاء الحساب" };
  } catch (e) {
    return { ok: false, error: mapSupabaseAuthError(e) };
  }
}

export async function signUpWithProfile({
  email,
  password,
  role,
  firstName,
  lastName,
  code,
}) {
  // Activation uniquement via activate-invited-account (OTP déjà vérifié).
  // Pas de repli auth.signUp : il créerait un compte sans preuve de boîte mail.
  if (role !== ROLES.MEMBER && role !== ROLES.SUPERVISOR) {
    return { ok: false, error: "دور غير صالح" };
  }
  return activateInvitedAuthAccount({
    email,
    password,
    role,
    firstName,
    lastName,
    code,
  });
}

export async function signOutAuth() {
  if (!isSupabaseConfigured()) return { ok: true };
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: mapSupabaseAuthError(error) };
  return { ok: true };
}

/**
 * Clé de session de supabase-js. supabase.js ne fixe pas de storageKey :
 * on lit celle du client Auth, sinon la dérivation par défaut de
 * SupabaseClient (`sb-<premier label du host>-auth-token`).
 */
function authSessionStorageKey() {
  const fromClient = supabase.auth?.storageKey;
  if (typeof fromClient === "string" && fromClient) return fromClient;
  return `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
}

/**
 * Repli de déconnexion quand signOut échoue (hors ligne avec jeton expiré :
 * supabase-js renvoie l'erreur sans effacer la session). Supprime les mêmes
 * clés que GoTrueClient._removeSession. N'émet pas SIGNED_OUT.
 * @returns {Promise<boolean>} true si la suppression a réussi
 */
export async function clearLocalAuthSession() {
  try {
    const key = authSessionStorageKey();
    await AsyncStorage.multiRemove([key, `${key}-code-verifier`, `${key}-user`]);
    return true;
  } catch (e) {
    console.warn("[auth] clearLocalAuthSession:", e?.message || e);
    return false;
  }
}

/**
 * Session créée par verifyOtp (recovery) : tant qu'elle est ouverte,
 * l'app ne doit pas basculer sur l'utilisateur connecté.
 * La clé AsyncStorage survit à une fermeture forcée.
 */
const PASSWORD_RECOVERY_STORAGE_KEY = "@mashrou3/password_recovery";
let passwordRecoveryActive = false;
const passwordRecoveryListeners = new Set();

async function writePasswordRecoveryMarker() {
  try {
    await AsyncStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, "1");
  } catch {
    /* le drapeau mémoire couvre la session encore ouverte */
  }
}

async function clearPasswordRecoveryMarker() {
  try {
    await AsyncStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
  } catch {
    /* le prochain démarrage réessaiera le signOut */
  }
}

/**
 * Efface la clé seulement si signOut n'a pas d'erreur et que getSession()
 * ne voit plus de session locale. Hors ligne, la clé reste pour un nouvel essai.
 * @returns {Promise<boolean>} true si la clé a été effacée
 */
async function signOutAndMaybeClearRecoveryMarker() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return false;
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || data?.session) return false;
    await clearPasswordRecoveryMarker();
    return true;
  } catch {
    return false;
  }
}

/**
 * Démarrage : une récupération interrompue ne doit pas restaurer l'utilisateur.
 * signOut, puis effacement de la clé seulement si la session locale est vide.
 * true = rester sur le login (la clé peut rester pour le prochain démarrage).
 */
export async function discardPersistedPasswordRecovery() {
  let marked = false;
  try {
    marked = (await AsyncStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY)) != null;
  } catch {
    return false;
  }
  if (!marked) return false;
  if (isSupabaseConfigured()) {
    await signOutAndMaybeClearRecoveryMarker();
  }
  setPasswordRecoveryActive(false);
  return true;
}

export function isPasswordRecoveryInProgress() {
  return passwordRecoveryActive;
}

export function subscribePasswordRecovery(listener) {
  passwordRecoveryListeners.add(listener);
  return () => passwordRecoveryListeners.delete(listener);
}

function setPasswordRecoveryActive(active) {
  if (passwordRecoveryActive === active) return;
  passwordRecoveryActive = active;
  passwordRecoveryListeners.forEach((listener) => listener(active));
}

/** signOut puis baisse du drapeau. Un second appel rejoint le premier. */
let abandonTask = null;

export function abandonPasswordRecovery() {
  if (!passwordRecoveryActive) return Promise.resolve({ ok: true });
  if (abandonTask) return abandonTask;
  abandonTask = (async () => {
    try {
      await signOutAndMaybeClearRecoveryMarker();
      return { ok: true };
    } finally {
      setPasswordRecoveryActive(false);
      abandonTask = null;
    }
  })();
  return abandonTask;
}

function passwordUpdateFailure(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  if (
    code === "same_password" ||
    /same password|should be different from the old password/i.test(msg)
  ) {
    return {
      ok: false,
      reason: "same_password",
      error: "هذه هي كلمة المرور الحالية، يمكنك تسجيل الدخول بها",
    };
  }
  if (code === "weak_password" || /weak password|known to be weak|pwned/i.test(msg)) {
    return {
      ok: false,
      reason: "weak_password",
      error: "كلمة المرور ضعيفة، اختر كلمة أطول",
    };
  }
  if (isNetworkError(error)) {
    return {
      ok: false,
      reason: "network",
      error: mapSupabaseAuthError(error),
    };
  }
  return {
    ok: false,
    reason: "save",
    error: "تعذّر حفظ كلمة المرور، حاول مرة أخرى",
  };
}

export async function requestPasswordReset(email) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail) return { ok: false, error: "أدخل البريد الإلكتروني" };

  // Envoi via Edge Function + Resend API (évite le SMTP Auth souvent en panne)
  const { data, error } = await supabase.functions.invoke("send-password-reset", {
    body: { email: mail },
  });

  if (error) {
    const status = error?.context?.status ?? error?.status;
    return { ok: false, error: mapSupabaseAuthError(error, status) };
  }
  if (data && data.ok === false) {
    return {
      ok: false,
      error: mapSupabaseAuthError({
        message: String(data.error || "فشل إرسال رمز الاستعادة"),
      }),
    };
  }
  return { ok: true };
}

/**
 * Premier temps : vérifie le code une seule fois et ouvre la session de récupération.
 * Le drapeau est levé avant verifyOtp et baissé si le code est refusé (pas de session).
 */
export async function verifyPasswordResetOtp(email, token) {
  const mail = String(email || "").trim().toLowerCase();
  const code = String(token || "").trim();
  if (!mail) return { ok: false, reason: "email", error: "أدخل البريد الإلكتروني" };
  if (!code) return { ok: false, reason: "otp", error: "أدخل رمز التحقق" };

  setPasswordRecoveryActive(true);
  await writePasswordRecoveryMarker();
  try {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: mail,
      token: code,
      type: "recovery",
    });
    if (verifyError) {
      setPasswordRecoveryActive(false);
      await clearPasswordRecoveryMarker();
      if (isNetworkError(verifyError)) {
        return {
          ok: false,
          reason: "network",
          error: mapSupabaseAuthError(verifyError),
        };
      }
      return {
        ok: false,
        reason: "otp",
        error: "الرمز غير صحيح أو منتهي الصلاحية",
      };
    }
    return { ok: true };
  } catch (error) {
    setPasswordRecoveryActive(false);
    await clearPasswordRecoveryMarker();
    if (isNetworkError(error)) {
      return {
        ok: false,
        reason: "network",
        error: mapSupabaseAuthError(error),
      };
    }
    return {
      ok: false,
      reason: "otp",
      error: "الرمز غير صحيح أو منتهي الصلاحية",
    };
  }
}

/**
 * Second temps : enregistre le mot de passe. Relançable tant que la session
 * de récupération est ouverte (le code n'est pas revérifié).
 */
export async function updatePasswordAfterRecovery(newPassword) {
  if (isPasswordTooShort(newPassword)) {
    return { ok: false, reason: "short", error: passwordTooShortMessage() };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    return passwordUpdateFailure(updateError);
  }

  await abandonPasswordRecovery();
  return { ok: true };
}

export async function getCurrentAuthSession() {
  if (!isSupabaseConfigured()) return { ok: true, session: null };
  const { data, error } = await supabase.auth.getSession();
  if (error) return { ok: false, error: mapSupabaseAuthError(error), session: null };
  return { ok: true, session: data.session };
}
