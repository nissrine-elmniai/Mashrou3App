import { supabase } from "./supabase";

/**
 * redirectTo exigé par resetPasswordForEmail.
 * On privilégie le flux OTP dans l'app (le HTML sur *.supabase.co
 * est forcé en text/plain et ne s'affiche pas).
 */
export function getPasswordResetRedirectUrl() {
  return "mashrou3app://reset-password";
}

/** Deep link natif de l'app (utilisé par la page auth-redirect) */
export function getPasswordResetAppDeepLink() {
  return "mashrou3app://reset-password";
}

/** Regroupe les paramètres de query (?a=1) et de fragment (#a=1) d'une URL de deep link */
function extractUrlParams(url) {
  const params = {};
  try {
    const decoded = decodeURIComponent(String(url || ""));
    const segments = decoded.split(/[?#]/).slice(1);
    for (const segment of segments) {
      const search = new URLSearchParams(segment);
      for (const [key, value] of search.entries()) {
        params[key] = value;
      }
    }
  } catch {
    // ignore malformed urls
  }
  return params;
}

/**
 * Traite un lien de deep link entrant (récupération mot de passe).
 * Supporte :
 * - access_token + refresh_token (+ type=recovery)
 * - token_hash + type=recovery (verifyOtp)
 * - code (PKCE exchangeCodeForSession)
 */
export async function handleAuthDeepLink(url) {
  if (!url) return { isRecovery: false };

  // Liens wrappés par Google / clients mail
  let resolved = String(url);
  const nested = resolved.match(/[?&]q=([^&]+)/);
  if (nested?.[1] && /supabase\.co/i.test(decodeURIComponent(nested[1]))) {
    resolved = decodeURIComponent(nested[1]);
  }

  const params = extractUrlParams(resolved);

  if (params.error_description || params.error) {
    return {
      isRecovery: false,
      error: decodeURIComponent(
        String(params.error_description || params.error).replace(/\+/g, " ")
      ),
    };
  }

  const type = params.type || "";
  const isRecoveryHint =
    type === "recovery" ||
    /reset-password/i.test(resolved) ||
    /type=recovery/i.test(resolved);

  // 1) Tokens directs (hash ou query)
  if (params.access_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token || "",
    });
    return {
      isRecovery: isRecoveryHint || type === "recovery" || !type,
      error: error?.message,
    };
  }

  // 2) token_hash (flux verify)
  if (params.token_hash && (type === "recovery" || !type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: "recovery",
    });
    return { isRecovery: true, error: error?.message };
  }

  // 3) PKCE code
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    return {
      isRecovery: isRecoveryHint,
      error: error?.message,
    };
  }

  return { isRecovery: false };
}
