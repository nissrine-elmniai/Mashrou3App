import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY manquants — remplis le fichier .env à la racine du projet."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Traduit les messages d'erreur Supabase Auth vers l'arabe, dans le même style que les Alert existantes */
export function mapSupabaseAuthError(error) {
  const msg = error?.message || "";
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
  return msg || "حدث خطأ غير متوقع";
}
