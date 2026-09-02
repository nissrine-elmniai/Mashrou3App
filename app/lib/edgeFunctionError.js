/**
 * Extrait un message lisible depuis une erreur supabase.functions.invoke.
 */
export async function parseEdgeFunctionError(
  error,
  fallback = "فشل استدعاء الخادم",
  options = {}
) {
  if (!error) return fallback;

  const functionName = options.functionName || "";
  let serverError = "";

  try {
    if (typeof error.context?.json === "function") {
      const body = await error.context.json();
      if (body?.error) serverError = String(body.error);
    } else if (typeof error.context?.text === "function") {
      const text = await error.context.text();
      try {
        const body = JSON.parse(text);
        if (body?.error) serverError = String(body.error);
      } catch {
        if (text?.trim()) serverError = text.trim();
      }
    }
  } catch {
    serverError = "";
  }

  const msg = String(error.message || "");

  if (serverError) return serverError;

  if (/not found|404/i.test(msg)) {
    if (functionName === "delete-user") {
      return "دالة حذف الحساب غير منشورة. انشرها: supabase functions deploy delete-user";
    }
    return "الدالة غير منشورة بعد على Supabase.";
  }

  if (/401|403|غير مصرح|جلسة|أدمن فقط/i.test(msg)) {
    return "جلسة غير صالحة أو ليس لديك صلاحية. سجّل الخروج ثم الدخول بحساب الأدمن.";
  }

  if (/non-2xx|FunctionsRelayError|FunctionsHttpError/i.test(msg)) {
    if (functionName === "delete-user") {
      return [
        "فشل حذف الحساب عبر Supabase.",
        "تحقق من:",
        "• نشر الدالة: supabase functions deploy delete-user",
        "• تسجيل الدخول بحساب الأدمن (admin@mosque.ma)",
      ].join("\n");
    }
    return [
      "فشل استدعاء Edge Function على Supabase.",
      "تحقق من:",
      "• نشر الدالة (send-app-email أو delete-user)",
      "• تسجيل الدخول بحساب الأدمن",
      "• إعداد RESEND_API_KEY أو SMTP في Secrets",
    ].join("\n");
  }

  return msg || fallback;
}
