export const USER_ERROR_MESSAGES = {
  network: "لا يوجد اتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.",
  server: "تعذر الاتصال بالخادم حالياً. أعد المحاولة بعد قليل.",
  email: "تعذر إرسال البريد الإلكتروني. أعد المحاولة لاحقاً.",
  rateLimit: "محاولات كثيرة. يرجى الانتظار قليلاً ثم إعادة المحاولة.",
  accountExists:
    "هذا البريد مرتبط بحساب موجود. سجّل الدخول أو استخدم «نسيت كلمة المرور».",
  unknown: "حدث خطأ غير متوقع. أعد المحاولة.",
};

const NETWORK_MESSAGE_RE =
  /network request failed|failed to fetch|fetch failed|network error/i;
const EMAIL_MARKER_RE = /smtp|resend|nodemailer|sb-error-code/i;
const TECHNICAL_MARKER_RE =
  /supabase|edge function|secret|api[_ ]?key|migration|rls|deploy/i;
const GENERIC_EDGE_MESSAGE_RE =
  /edge function returned a non-2xx status code/i;
const ARABIC_RE = /[\u0600-\u06FF]/;
const EMAIL_RE = /unexpected_failure|error sending|smtp/i;
const ACCOUNT_EXISTS_RE = /already (been )?registered|already exists/i;
const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
]);

function numericStatus(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorMessage(error) {
  if (typeof error === "string") return error;
  return typeof error?.message === "string" ? error.message : "";
}

export function isNetworkError(error, status) {
  const name = typeof error === "string" ? "" : error?.name;
  const message = errorMessage(error);
  const errorStatus = numericStatus(error?.status);
  const responseStatus = numericStatus(status);
  if (name === "AuthRetryableFetchError" && errorStatus === 0) return true;
  if (name === "FunctionsFetchError") return true;
  if (responseStatus === 0) return true;
  if (name === "TypeError") return true;
  if (NETWORK_MESSAGE_RE.test(message)) return true;
  return false;
}

export function isServerError(error, status) {
  const name = typeof error === "string" ? "" : error?.name;
  const errorStatus = numericStatus(error?.status);
  const responseStatus = numericStatus(status);
  if (
    name === "AuthRetryableFetchError" &&
    typeof errorStatus === "number" &&
    errorStatus >= 500
  ) {
    return true;
  }
  if (name === "FunctionsRelayError") return true;
  if (
    name === "FunctionsHttpError" &&
    numericStatus(error?.context?.status) >= 500
  ) {
    return true;
  }
  if (typeof responseStatus === "number" && responseStatus >= 500) return true;
  if (typeof errorStatus === "number" && errorStatus >= 500) return true;
  return false;
}

export function hasEmailMarker(text) {
  return EMAIL_MARKER_RE.test(markerSource(text));
}

export function hasTechnicalMarker(text) {
  return TECHNICAL_MARKER_RE.test(markerSource(text));
}

function markerSource(text) {
  const value = String(text || "");
  if (GENERIC_EDGE_MESSAGE_RE.test(value)) return "";
  return value;
}

function isCleanArabic(text) {
  const value = String(text || "");
  if (!value || GENERIC_EDGE_MESSAGE_RE.test(value)) return false;
  return isArabicText(value) && !hasEmailMarker(value) && !hasTechnicalMarker(value);
}

function alreadyReadErrorText(error) {
  const ctx = error?.context;
  if (ctx == null || typeof ctx !== "object") return "";
  if (typeof ctx.json === "function" || typeof ctx.text === "function") return "";
  const raw = ctx.error ?? ctx.message ?? ctx.msg ?? "";
  return typeof raw === "string" ? raw : "";
}

export function isArabicText(text) {
  return ARABIC_RE.test(String(text || ""));
}

export function logUserError(context, error) {
  const status = numericStatus(error?.status);
  console.warn(context, {
    name: error?.name,
    status,
    code: error?.code,
    message: errorMessage(error),
  });
}

function logged(kind, error) {
  logUserError("mapSupabaseAuthError", error);
  return USER_ERROR_MESSAGES[kind];
}

/**
 * Traduit une erreur Auth / Edge / PostgREST vers un texte arabe affichable.
 * Le second argument est le statut HTTP de la réponse quand l'objet error ne le porte pas.
 */
export function mapSupabaseAuthError(error, status) {
  if (isNetworkError(error, status)) return logged("network", error);

  const msg = errorMessage(error);
  const code = String(
    (typeof error === "object" && error ? error.code : "") || ""
  );
  const name = typeof error === "object" && error ? error.name || "" : "";
  const statusNum =
    numericStatus(status) ?? numericStatus(error?.status);
  let raw = "";
  try {
    raw = typeof error === "string" ? error : JSON.stringify(error);
  } catch {
    raw = "";
  }
  const blob = `${msg} ${code} ${name} ${statusNum ?? ""} ${raw}`;
  const msgTrim = msg.trim();
  const emailJson = msgTrim.startsWith("{") && /sb-error-code/i.test(msg);
  const emailLike = EMAIL_RE.test(`${msg} ${code} ${name}`) || emailJson;

  if (/invalid login credentials/i.test(msg)) {
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
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
  if (
    !isServerError(error, status) &&
    !emailLike &&
    (msgTrim.startsWith("{") || /__isAuthError/i.test(blob))
  ) {
    return "حدث خطأ في الخادم. حاول مرة أخرى.";
  }
  if (statusNum === 429 || RATE_LIMIT_CODES.has(code)) {
    return USER_ERROR_MESSAGES.rateLimit;
  }
  if (
    code === "email_exists" ||
    code === "user_already_exists" ||
    ACCOUNT_EXISTS_RE.test(msg)
  ) {
    return USER_ERROR_MESSAGES.accountExists;
  }
  if (emailLike) return logged("email", error);
  if (isServerError(error, status)) return logged("server", error);
  if (name === "FunctionsHttpError") {
    const body = alreadyReadErrorText(error);
    if (isCleanArabic(body)) return body;
    return logged("unknown", error);
  }
  const visible = markerSource(msg);
  if (isCleanArabic(visible)) return visible;
  if (hasEmailMarker(visible) || hasEmailMarker(code)) return logged("email", error);
  if (hasTechnicalMarker(visible) || hasTechnicalMarker(code)) {
    return logged("unknown", error);
  }
  return logged("unknown", error);
}
