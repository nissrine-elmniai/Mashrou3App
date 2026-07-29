import { APP_EMAIL, USE_MOCK_EMAIL } from "../constants/email";

/**
 * إرسال بريد التطبيق.
 * حالياً: mock (لا يفتح Gmail ولا يستدعي API) — جاهز للاستبدال بالـ backend لاحقاً.
 */
async function sendAppEmail({ toEmail, toName, subject, message }) {
  const email = String(toEmail || "").trim();
  if (!email) {
    return { ok: false, error: "لا يوجد بريد إلكتروني للمستلم" };
  }

  if (USE_MOCK_EMAIL) {
    // محاكاة تأخير الشبكة لتختبر واجهة التحميل
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

  // لاحقاً: استدعاء الـ backend هنا
  return {
    ok: false,
    error: "خدمة البريد الحقيقي غير مفعّلة بعد (وضع الواجهات فقط)",
  };
}

/** رسالة قبول طلب عضو */
export async function sendMemberAcceptEmail({ toEmail, fullName }) {
  const subject = "تم قبول طلبك — مهندس حامل لكتاب الله";
  const message = [
    `السلام عليكم ${fullName || ""}،`,
    "",
    "تم قبول طلب انضمامك إلى حلقة تحفيظ القرآن الكريم.",
    "يمكنك الآن إنشاء حسابك انطلاقاً من التطبيق.",
    "",
    "بارك الله فيك.",
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
    "يمكنك الآن إنشاء حسابك انطلاقاً من التطبيق.",
    "",
    "بارك الله فيك.",
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
