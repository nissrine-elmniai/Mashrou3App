import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Clé anon publique du projet (déjà dans scripts/.env.seed.example).
// Sert de repli si Metro n'a pas chargé le .env (redémarrage requis pour EXPO_PUBLIC_*).
const FALLBACK_SUPABASE_URL = "https://okqmyayjeiwzjkwlkmia.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rcW15YXlqZWl3emprd2xrbWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMjg2MjUsImV4cCI6MjA5OTgwNDYyNX0.ttGINg_0hHbJcMiTBFTKnqOlNXO68VasZhx7kaPjwJg";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL;
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

/** Traduit les messages d'erreur Supabase Auth vers l'arabe, dans le même style que les Alert existantes */
export function mapSupabaseAuthError(error) {
  const msg = error?.message || "";
  const code = error?.code || error?.status || "";
  let raw = "";
  try {
    raw = typeof error === "string" ? error : JSON.stringify(error);
  } catch {
    raw = "";
  }
  const blob = `${msg} ${code} ${error?.name || ""} ${raw}`;

  // Erreur SMTP / envoi e-mail (souvent après activation Custom SMTP)
  // ou échec update email (Supabase envoie un mail de confirmation)
  if (
    /unexpected_failure|error sending|smtp|\b500\b|AuthRetryableFetchError/i.test(
      blob
    ) ||
    (typeof msg === "string" &&
      msg.trim().startsWith("{") &&
      /sb-error-code/i.test(msg))
  ) {
    return "تعذر إرسال بريد التأكيد. تحقق من إعدادات SMTP في Supabase (Resend) ثم أعد المحاولة.";
  }
  if (/invalid login credentials/i.test(msg)) {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
  }
  if (/user already registered|already been registered/i.test(msg)) {
    return "هذا البريد مستخدم مسبقاً";
  }
  if (/email not confirmed/i.test(msg)) {
    return "يجب تأكيد بريدك الإلكتروني أولاً (راجع صندوق الوارد)";
  }
  if (/password should be at least/i.test(msg)) {
    return "كلمة المرور قصيرة جداً";
  }
  if (/unable to validate email address|invalid email/i.test(msg)) {
    return "البريد الإلكتروني غير صالح";
  }
  if (/token|otp|expired|invalid/i.test(msg) && /recovery|verify/i.test(blob)) {
    return "رمز التحقق غير صالح أو منتهٍ. أعد إرسال الرمز.";
  }
  // Ne jamais afficher un dump JSON brut à l'utilisateur
  if (
    (typeof msg === "string" && msg.trim().startsWith("{")) ||
    /sb-error-code|__isAuthError/i.test(blob)
  ) {
    return "حدث خطأ في الخادم. حاول مرة أخرى.";
  }
  return msg || "حدث خطأ غير متوقع";
}
