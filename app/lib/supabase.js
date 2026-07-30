import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY manquants — remplis le fichier .env à la racine du projet."
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

// Placeholder URL si .env absent (évite un crash au démarrage ; auth refusera les appels)
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
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
  const blob = `${msg} ${code} ${error?.name || ""}`;

  // Erreur SMTP / envoi e-mail (souvent après activation Custom SMTP)
  if (
    /unexpected_failure|error sending|smtp|500/i.test(blob) ||
    (typeof msg === "string" && msg.trim().startsWith("{") && /sb-error-code/i.test(msg))
  ) {
    return "تعذر إرسال البريد. تحقق من إعدادات SMTP في Supabase (Resend).";
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
  if (typeof msg === "string" && msg.trim().startsWith("{")) {
    return "حدث خطأ في الخادم. حاول مرة أخرى.";
  }
  return msg || "حدث خطأ غير متوقع";
}
