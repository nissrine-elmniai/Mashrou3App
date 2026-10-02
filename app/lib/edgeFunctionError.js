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
    const body = await readInvokeErrorBody(error);
    const raw = body?.error || body?.message || body?.msg || "";
    if (raw) serverError = String(raw);
  } catch {
    serverError = "";
  }

  const msg = String(error.message || "");

  if (
    /invalid jwt|unauthorized/i.test(serverError) ||
    (!serverError && /401|403|invalid jwt|unauthorized/i.test(msg))
  ) {
    return "جلسة غير صالحة أو ليس لديك صلاحية. سجّل الخروج ثم الدخول بحساب الأدمن.";
  }

  if (serverError) return serverError;

  if (/not found|404/i.test(msg)) {
    if (functionName === "delete-user") {
      return "دالة حذف الحساب غير منشورة. انشرها: supabase functions deploy delete-user";
    }
    return "الدالة غير منشورة بعد على Supabase.";
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

async function readInvokeErrorBody(error) {
  const ctx = error?.context;
  if (!ctx) return null;
  if (typeof ctx === "object" && (ctx.error || ctx.message || ctx.msg) && typeof ctx.json !== "function") {
    return ctx;
  }
  if (typeof ctx.clone === "function" && typeof ctx.json === "function") {
    try {
      return await ctx.clone().json();
    } catch {
      /* le corps peut déjà être consommé */
    }
  }
  if (typeof ctx.json === "function") {
    return await ctx.json();
  }
  if (typeof ctx.text === "function") {
    const text = await ctx.text();
    try {
      return JSON.parse(text);
    } catch {
      return text?.trim() ? { message: text.trim() } : null;
    }
  }
  return null;
}
