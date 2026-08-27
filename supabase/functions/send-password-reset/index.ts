// Génère un OTP recovery Supabase et l'envoie via Resend (API),
// sans passer par le SMTP Auth (souvent en erreur).
// Deploy: npx supabase functions deploy send-password-reset --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendTransactionalEmail } from "../_shared/sendMail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return json({ ok: false, error: "أدخل بريداً إلكترونياً صالحاً" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Génère le code sans envoyer l'e-mail Auth (évite le SMTP cassé)
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    // Réponse neutre si l'utilisateur n'existe pas (pas de fuite d'info)
    if (error || !data?.properties?.email_otp) {
      console.error("generateLink:", error?.message || "no otp");
      return json({ ok: true });
    }

    const otp = data.properties.email_otp;
    const subject = "رمز استعادة كلمة المرور — مهندس حامل لكتاب الله";
    const text = [
      "السلام عليكم،",
      "",
      "رمز التحقق لإعادة تعيين كلمة المرور:",
      otp,
      "",
      "أدخل هذا الرمز في التطبيق مع كلمة المرور الجديدة.",
      "إذا لم تطلب ذلك، تجاهل هذه الرسالة.",
    ].join("\n");
    const html = `
          <p>السلام عليكم،</p>
          <p>رمز التحقق لإعادة تعيين كلمة المرور:</p>
          <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${otp}</p>
          <p>أدخل هذا الرمز في التطبيق مع كلمة المرور الجديدة.</p>
          <p>إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>
        `;

    const sent = await sendTransactionalEmail({
      to: email,
      subject,
      text,
      html,
    });
    if (!sent.ok) {
      return json({ ok: false, error: sent.error }, 502);
    }

    return json({ ok: true, via: sent.via, id: sent.id });
  } catch (e) {
    return json(
      { ok: false, error: e?.message || "خطأ غير متوقع" },
      500
    );
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
