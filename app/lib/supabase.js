import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

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
  }
);

