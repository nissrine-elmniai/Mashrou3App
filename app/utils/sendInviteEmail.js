import { APP_EMAIL, USE_MOCK_EMAIL } from "../constants/email";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { isNetworkError, mapSupabaseAuthError } from "../lib/userError";

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlParagraph(text, margin = "0 0 16px") {
  return `<p style="margin:${margin};">${text}</p>`;
}

/**
 * إرسال بريد التطبيق عبر Edge Function (Resend).
 * إن كان USE_MOCK_EMAIL=true → محاكاة فقط.
 * html اختياري : إن وُجد يُرسل كما هو، وإلا تولّده الدالة من النص.
 */
async function sendAppEmail({ toEmail, toName, subject, message, html }) {
  const email = String(toEmail || "").trim();
  if (!email) {
    return { ok: false, error: "لا يوجد بريد إلكتروني للمستلم" };
  }

  if (USE_MOCK_EMAIL) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (__DEV__) {
      console.log("[mock email]", {
        from: `${APP_EMAIL.fromName} <${APP_EMAIL.fromEmail}>`,
        to: `${toName || ""} <${email}>`,
        subject,
        message,
        html,
      });
    }
    return {
      ok: true,
      via: "mock",
      fromEmail: APP_EMAIL.fromEmail,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: mapSupabaseAuthError({
        message: "Supabase غير مُعدّ — تحقق من ملف .env",
      }),
    };
  }

  try {
    const invokePromise = supabase.functions.invoke("send-app-email", {
      body: {
        toEmail: email,
        toName: toName || "",
        subject,
        message,
        ...(html ? { html } : {}),
      },
    });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("انتهت مهلة إرسال البريد (15ث)")),
        15000
      );
    });
    const { data, error } = await Promise.race([
      invokePromise,
      timeoutPromise,
    ]);

    if (error) {
      const status = error?.context?.status ?? error?.status;
      if (isNetworkError(error, status)) {
        return { ok: false, error: mapSupabaseAuthError(error, status) };
      }
      let serverError = "";
      try {
        const body = await error.context?.json();
        serverError = String(body?.error || "");
      } catch {
        serverError = "";
      }
      return {
        ok: false,
        error: serverError
          ? mapSupabaseAuthError({ message: serverError })
          : mapSupabaseAuthError(error, status),
      };
    }

    if (data && data.ok === false) {
      return {
        ok: false,
        error: mapSupabaseAuthError({
          message: String(data.error || "فشل إرسال البريد"),
        }),
      };
    }

    return {
      ok: true,
      via: data?.via || "resend",
      fromEmail: APP_EMAIL.fromEmail,
      id: data?.id,
    };
  } catch (e) {
    return { ok: false, error: mapSupabaseAuthError(e) };
  }
}

/** رسالة قبول طلب عضو */
export async function sendMemberAcceptEmail({
  toEmail,
  fullName,
}) {
  const name = String(fullName || "").trim() || "الطالب";
  const subject = "تم قبول طلبك — مهندس حامل لكتاب الله";
  const message = [
    `السلام عليكم ${name}،`,
    "",
    "",
    "تم قبول طلب انضمامك إلى مشروع مهندس حامل لكتاب الله.",
    "",
    "لإنشاء حسابك في التطبيق:",
    "1) افتح التطبيق",
    "2) من شاشة تسجيل الدخول اختر «عضو جديد»",
    "3) أدخل نفس بريدك الإلكتروني ثم اضغط «إرسال الرمز»",
    "4) سيصلك رمز مكوّن من 6 أرقام على هذا البريد. أدخله مع كلمة المرور",
    "",
    "بارك الله فيك.",
    "",
    `— ${APP_EMAIL.fromName}`,
  ].join("\n");

  return sendAppEmail({
    toEmail,
    toName: fullName,
    subject,
    message,
  });
}

/** رسالة رفض طلب انضمام */
export async function sendMemberRejectEmail({ toEmail, fullName }) {
  const subject = "طلب الانضمام لمشروع مهندس حامل لكتاب الله";
  const message = [
    "الالسلام عليكم ورحمة الله،",
    "شكراً لاهتمامك بمشروع «مهندس حامل لكتاب الله». نعتذر، لم نتمكن من قبول طلب انضمامك. تأكّد من صحة المعلومات ثم أعد المحاولة.",
    "بالتوفيق",
  ].join("\n");

  return sendAppEmail({
    toEmail,
    toName: fullName,
    subject,
    message,
  });
}

/** رسالة دعوة مشرف */
export async function sendSupervisorInviteEmail({
  toEmail,
  fullName,
}) {
  const name = String(fullName || "").trim();
  const email = String(toEmail || "").trim();
  const fromName = APP_EMAIL.fromName;
  const subject = "دعوة للانضمام كمشرف — مهندس حامل لكتاب الله";
  const message = [
    `السلام عليكم ورحمة الله ${name}،`,
    "",
    "يسعدنا دعوتك للانضمام إلى تطبيق مهندس حامل لكتاب الله بصفتك مشرفاً.",
    "",
    "لتفعيل حسابك:",
    "",
    "1. حمّل التطبيق وافتحه.",
    "2. اختر «مشرف جديد».",
    `3. أدخل هذا البريد الإلكتروني نفسه: ${email}، ثم اضغط «إرسال الرمز».`,
    "4. سيصلك رمز مكوّن من 6 أرقام على هذا البريد. أدخله مع كلمة مرور جديدة.",
    "",
    "بعد التفعيل، سيتم تعيين حصتك من طرف الإدارة.",
    "",
    "بارك الله فيك وجزاك خيراً.",
    `— ${fromName}`,
  ].join("\n");

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeFrom = escapeHtml(fromName);
  const html = [
    `<div dir="rtl">`,
    htmlParagraph(`السلام عليكم ورحمة الله ${safeName}،`),
    htmlParagraph(
      "يسعدنا دعوتك للانضمام إلى تطبيق مهندس حامل لكتاب الله بصفتك مشرفاً."
    ),
    htmlParagraph("لتفعيل حسابك:", "0 0 8px"),
    `<ol dir="rtl" style="margin:0 0 16px;padding-inline-start:1.4em;">`,
    `<li>حمّل التطبيق وافتحه.</li>`,
    `<li>اختر «مشرف جديد».</li>`,
    `<li>أدخل هذا البريد الإلكتروني نفسه: ${safeEmail}، ثم اضغط «إرسال الرمز».</li>`,
    `<li>سيصلك رمز مكوّن من 6 أرقام على هذا البريد. أدخله مع كلمة مرور جديدة.</li>`,
    `</ol>`,
    htmlParagraph("بعد التفعيل، سيتم تعيين حصتك من طرف الإدارة."),
    htmlParagraph("بارك الله فيك وجزاك خيراً.", "0 0 8px"),
    htmlParagraph(`— ${safeFrom}`, "0"),
    `</div>`,
  ].join("");

  return sendAppEmail({
    toEmail,
    toName: fullName,
    subject,
    message,
    html,
  });
}

/** توافق مع الاستدعاءات القديمة */
export const sendInviteViaGmail = sendMemberAcceptEmail;
export const sendSupervisorInviteViaGmail = sendSupervisorInviteEmail;
