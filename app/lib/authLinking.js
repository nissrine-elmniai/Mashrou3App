import * as Linking from "expo-linking";
import { supabase } from "./supabase";

/** URL de retour utilisée par supabase.auth.resetPasswordForEmail() */
export function getPasswordResetRedirectUrl() {
  return Linking.createURL("reset-password");
}

/** Regroupe les paramètres de query (?a=1) et de fragment (#a=1) d'une URL de deep link */
function extractUrlParams(url) {
  const params = {};
  const segments = url.split(/[?#]/).slice(1);
  for (const segment of segments) {
    const search = new URLSearchParams(segment);
    for (const [key, value] of search.entries()) {
      params[key] = value;
    }
  }
  return params;
}

/**
 * Traite un lien de deep link entrant. Si c'est un lien de récupération de
 * mot de passe Supabase (?type=recovery avec des tokens), établit la
 * session correspondante et signale qu'il faut naviguer vers
 * "ResetPassword".
 */
export async function handleAuthDeepLink(url) {
  if (!url) return { isRecovery: false };

  const params = extractUrlParams(url);

  if (params.error_description) {
    return {
      isRecovery: false,
      error: decodeURIComponent(params.error_description.replace(/\+/g, " ")),
    };
  }

  if (params.type !== "recovery" || !params.access_token) {
    return { isRecovery: false };
  }

  const { error } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });

  return { isRecovery: true, error: error?.message };
}
