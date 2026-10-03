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
  if (isGenericEdgeMessage(serverError)) serverError = "";

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

function isGenericEdgeMessage(value) {
  return /edge function returned a non-2xx status code/i.test(String(value || ""));
}

function asErrorBody(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || isGenericEdgeMessage(text)) return null;
    try {
      return asErrorBody(JSON.parse(text));
    } catch {
      return { message: text.slice(0, 500) };
    }
  }
  if (typeof value === "object") {
    const raw = value.error || value.message || value.msg || "";
    if (raw && !isGenericEdgeMessage(raw)) return value;
  }
  return null;
}

async function readInvokeErrorBody(error) {
  const ctx = error?.context;
  if (!ctx) return null;
  if (typeof ctx === "string") return asErrorBody(ctx);

  const plain =
    typeof ctx === "object" &&
    (ctx.error || ctx.message || ctx.msg || ctx._bodyText || ctx._bodyInit) &&
    typeof ctx.json !== "function"
      ? asErrorBody(ctx._bodyText || ctx._bodyInit || ctx)
      : null;
  if (plain) return plain;

  const readers = [];
  if (typeof ctx.clone === "function") {
    readers.push(async () => {
      const copy = ctx.clone();
      if (typeof copy.text === "function") return asErrorBody(await copy.text());
      if (typeof copy.json === "function") return asErrorBody(await copy.json());
      return null;
    });
  }
  if (typeof ctx.text === "function") {
    readers.push(async () => asErrorBody(await ctx.text()));
  }
  if (typeof ctx.json === "function") {
    readers.push(async () => asErrorBody(await ctx.json()));
  }

  for (const read of readers) {
    try {
      const body = await read();
      if (body) return body;
    } catch {
      /* corps déjà consommé, ou pas du JSON */
    }
  }
  return null;
}
