import { APP_EMAIL, USE_MOCK_EMAIL } from "../constants/email";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

function mapEmailSendError(raw) {
  const msg = String(raw || "");
  if (/only send testing emails|verify a domain|resend.com\/domains/i.test(msg)) {
    return [
      "Resend في وضع الاختبار: لا يُرسل إلا إلى بريد حسابك.",
      "لإرسال الدعوات لأي عنوان:",
      "1) ثبّت نطاقاً في resend.com/domains",
      "2) في Supabase Secrets ضع FROM_EMAIL مثل: مهندس حامل لكتاب الله <noreply@ton-domaine.com>",
      "3) أعد نشر الدالة send-app-email",
      "",
      "الدعوة محفوظة: يمكن للمشرف إنشاء حسابه من التطبيق دون البريد.",
    ].join("\n");
  }
  return msg;
}

/**
 * إرسال بريد التطبيق عبر Edge Function (Resend).
 * إن كان USE_MOCK_EMAIL=true → محاكاة فقط.
 */
async function sendAppEmail({ toEmail, toName, subject, message }) {
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
      error: "Supabase غير مُعدّ — تحقق من ملف .env",
    };
  }

  try {
    const invokePromise = supabase.functions.invoke("send-app-email", {
      body: {
        toEmail: email,
        toName: toName || "",
        subject,
        message,
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
      let serverError = "";
      try {
        const body = await error.context?.json();
        serverError = String(body?.error || "");
      } catch {
        serverError = "";
      }
      const msg = error.message || "";
      if (/failed to send|FunctionsRelayError|404|not found/i.test(msg)) {
        return {
          ok: false,
          error:
            "دالة الإرسال غير منشورة بعد. انشر send-app-email واضبط RESEND_API_KEY.",
        };
      }
      return {
        ok: false,
        error: mapEmailSendError(serverError || msg) || "فشل استدعاء خدمة البريد",
      };
    }

    if (data && data.ok === false) {
      return {
        ok: false,
        error: mapEmailSendError(data.error) || "فشل إرسال البريد",
      };
    }

    return {
      ok: true,
      via: data?.via || "resend",
      fromEmail: APP_EMAIL.fromEmail,
      id: data?.id,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "فشل إرسال البريد" };
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
    "3) أدخل نفس بريدك الإلكتروني واختر كلمة مرور",
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

/** رسالة تعيين مشرف على مجموعة */
export async function sendSupervisorInviteEmail({
  toEmail,
  fullName,
  groupName,
}) {
  const subject = "تعيين مشرف — مهندس حامل لكتاب الله";
  const message = [
    `السلام عليكم ${fullName || ""}،`,
    "",
    `تم تعيينك مشرفاً على المجموعة: ${groupName || "—"}.`,
    "يمكنك الآن إنشاء حسابك انطلاقاً من التطبيق (تسجيل دخول المشرف ← إنشاء حساب لأول مرة).",
    "",
    "بارك الله فيك.",
    `— ${APP_EMAIL.fromName}`,
  ].join("\n");

  return sendAppEmail({
    toEmail,
    toName: fullName,
    subject,
    message,
  });
}

/** توافق مع الاستدعاءات القديمة */
export const sendInviteViaGmail = sendMemberAcceptEmail;
export const sendSupervisorInviteViaGmail = sendSupervisorInviteEmail;
