import { supabase } from "./supabase";

/**
 * Retour après confirmation du changement d'e-mail.
 * Chemin absent de la config linking : React Navigation ne navigue pas.
 */
export function getEmailChangeRedirectUrl() {
  return "mashrou3app://email-change";
}

function isEmailChangeUrl(url, type) {
  if (type === "email_change") return true;
  const path = String(url || "").split(/[?#]/)[0];
  return /email-change\/?$/i.test(path);
}

/** Journal de dev : forme des paramètres, sans jetons. */
function logAuthUrlDev(url) {
  if (!__DEV__) return;
  const safe = String(url || "").replace(
    /([?#&])(access_token|refresh_token|token_hash|code|provider_token|id_token)=[^&#]*/gi,
    "$1$2=[redacted]"
  );
  console.log("[auth-link]", safe);
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
 * Traite un lien entrant.
 * Le changement d'e-mail est reconnu en premier et ne partage pas
 * la suite (jetons, token_hash, code PKCE) avec un autre classement.
 */
export async function handleAuthDeepLink(url) {
  if (!url) return {};

  // Liens wrappés par Google / clients mail
  let resolved = String(url);
  const nested = resolved.match(/[?&]q=([^&]+)/);
  if (nested?.[1] && /supabase\.co/i.test(decodeURIComponent(nested[1]))) {
    resolved = decodeURIComponent(nested[1]);
  }

  logAuthUrlDev(resolved);

  const params = extractUrlParams(resolved);
  const type = params.type || "";

  // Changement d'e-mail : traité seul, avant les autres jetons.
  if (isEmailChangeUrl(resolved, type)) {
    if (params.error_description || params.error) {
      return { emailChangeError: true };
    }
    if (params.access_token) {
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token || "",
      });
      return {
        isEmailChange: !error,
        error: error?.message,
      };
    }
    return {};
  }

  if (params.error_description || params.error) {
    return {
      error: decodeURIComponent(
        String(params.error_description || params.error).replace(/\+/g, " ")
      ),
    };
  }

  // Lien de récupération de mot de passe : parcours retiré, aucune session.
  if (type === "recovery") {
    return {};
  }

  // Jetons directs (hash ou query), hors changement d'e-mail.
  if (params.access_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token || "",
    });
    return { error: error?.message };
  }

  // token_hash sans type (verifyOtp), hors changement d'e-mail.
  if (params.token_hash && !type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: "recovery",
    });
    return { error: error?.message };
  }

  // Code PKCE.
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    return { error: error?.message };
  }

  return {};
}
