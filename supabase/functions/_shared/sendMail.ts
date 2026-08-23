import nodemailer from "npm:nodemailer@6.9.16";

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type MailResult =
  | { ok: true; via: string; id?: string }
  | { ok: false; error: string };

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function htmlFromText(message: string) {
  return message
    .split("\n")
    .map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");
}

function inferSmtpHost(user: string) {
  const domain = (user.split("@")[1] || "").toLowerCase();
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return "smtp.gmail.com";
  }
  if (
    domain.endsWith("ump.ac.ma") ||
    domain.includes("outlook") ||
    domain.includes("hotmail") ||
    domain.includes("live.com")
  ) {
    return "smtp.office365.com";
  }
  return "smtp.gmail.com";
}

async function sendViaSmtp(payload: MailPayload): Promise<MailResult> {
  const user = Deno.env.get("SMTP_USER")?.trim();
  const pass = Deno.env.get("SMTP_PASS")?.trim();
  if (!user || !pass) {
    return { ok: false, error: "SMTP غير مُعدّ" };
  }

  const host = Deno.env.get("SMTP_HOST")?.trim() || inferSmtpHost(user);
  const port = Number(Deno.env.get("SMTP_PORT") || (host.includes("gmail") ? 465 : 587));
  const secure =
    Deno.env.get("SMTP_SECURE") === "true" || port === 465;
  const fromName = Deno.env.get("FROM_NAME") || "مهندس حامل لكتاب الله";
  const fromAddr = Deno.env.get("SMTP_FROM")?.trim() || user;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddr}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return { ok: true, via: "smtp", id: String(info.messageId || "") };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("SMTP send error:", msg);
    return { ok: false, error: msg || "فشل الإرسال عبر SMTP" };
  }
}

async function sendViaResend(payload: MailPayload): Promise<MailResult> {
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendKey) {
    return { ok: false, error: "RESEND_API_KEY غير مُعدّ في secrets" };
  }
  const fromEmail =
    Deno.env.get("FROM_EMAIL") ||
    "مهندس حامل لكتاب الله <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [payload.to],
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      (data as { message?: string; error?: string })?.message ||
      (data as { error?: string })?.error ||
      "فشل إرسال البريد عبر Resend";
    return { ok: false, error: String(errMsg) };
  }
  return {
    ok: true,
    via: "resend",
    id: String((data as { id?: string }).id || ""),
  };
}

/**
 * SMTP d'abord (Gmail / Outlook) : n'importe quel destinataire.
 * Sinon Resend (mode test = uniquement le mail du compte Resend).
 */
export async function sendTransactionalEmail(
  payload: MailPayload
): Promise<MailResult> {
  const hasSmtp = Boolean(
    Deno.env.get("SMTP_USER")?.trim() && Deno.env.get("SMTP_PASS")?.trim()
  );
  if (hasSmtp) {
    const smtp = await sendViaSmtp(payload);
    if (smtp.ok) return smtp;
  }

  const resend = await sendViaResend(payload);
  if (resend.ok) return resend;

  if (/only send testing emails|verify a domain/i.test(resend.error)) {
    return {
      ok: false,
      error:
        "Resend لا يرسل إلا إلى بريد حسابك. عيّن SMTP_USER و SMTP_PASS في Supabase Secrets ثم أعد نشر send-app-email.",
    };
  }
  return resend;
}
