import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import {
  configureProbe,
  getProbeUrl,
  reportHttpResponse,
  reportTransportFailure,
} from "./networkState";

export { mapSupabaseAuthError } from "./userError";

// Clé anon publique du projet (déjà dans scripts/.env.seed.example).
// Sert de repli si Metro n'a pas chargé le .env (redémarrage requis pour EXPO_PUBLIC_*).
const FALLBACK_SUPABASE_URL = "https://okqmyayjeiwzjkwlkmia.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rcW15YXlqZWl3emprd2xrbWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMjg2MjUsImV4cCI6MjA5OTgwNDYyNX0.ttGINg_0hHbJcMiTBFTKnqOlNXO68VasZhx7kaPjwJg";

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase: .env absent — utilisation des identifiants publics du projet. Crée un fichier .env à la racine pour les surcharger."
  );
}

export function isSupabaseConfigured() {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes("YOUR_PROJECT") &&
      !supabaseUrl.includes("placeholder")
  );
}

configureProbe(supabaseUrl);

/** Erreur de transport (pas de réponse HTTP). Une annulation volontaire n'en est pas une. */
function isTransportError(error) {
  if (!error || error.name === "AbortError") return false;
  if (error.name === "TypeError") return true;
  return /network request failed|failed to fetch|fetch failed|network error/i.test(
    String(error.message || "")
  );
}

/**
 * fetch transmis au client (auth, postgrest, storage, functions, et les appels
 * HTTP de realtime ; pas ses WebSockets). Renvoie exactement la réponse du fetch
 * d'origine, ou relance exactement la même erreur : il ne fait que signaler
 * l'état réseau à networkState. La sonde (/auth/v1/health) n'est pas observée.
 */
function observedFetch(input, init) {
  const url = typeof input === "string" ? input : input?.url;
  if (url && url === getProbeUrl()) return fetch(input, init);
  return fetch(input, init).then(
    (response) => {
      reportHttpResponse();
      return response;
    },
    (error) => {
      if (isTransportError(error)) reportTransportFailure();
      throw error;
    }
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: observedFetch },
  }
);

