// Supabase Edge Function — envoi d'e-mails via Resend
// Deploy: supabase functions deploy send-app-email
// Secret: supabase secrets set RESEND_API_KEY=re_xxx
// Optionnel: supabase secrets set FROM_EMAIL="Nom <noreply@ton-domaine.com>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@4.0.0";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, error: "غير مصرح" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error("Auth error:", userError);
      return json({ ok: false, error: "جلسة غير صالحة" }, 401);
    }

    // Vérification du rôle
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
    }

    if (!profile || !["admin", "supervisor"].includes(profile.role)) {
      return json({ ok: false, error: "ليس لديك صلاحية إرسال البريد" }, 403);
    }

    // Parsing du body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "جسم الطلب غير صالح (JSON)" }, 400);
    }

    const toEmail = String(body.toEmail || "").trim().toLowerCase();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    const toName = String(body.toName || "").trim();

    if (!toEmail || !subject || !message) {
      return json(
        { ok: false, error: "بيانات البريد غير مكتملة (toEmail, subject, message)" },
        400
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return json(
        { ok: false, error: "RESEND_API_KEY غير مُعدّ في secrets" },
        500
      );
    }

    const fromEmail =
      Deno.env.get("FROM_EMAIL") ||
      "Mashrou3 <onboarding@resend.dev>";

    // Envoi via SDK Resend
    const resend = new Resend(resendKey);

    const { data, error: resendError } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject,
      text: message,
      html: message
        .split("\n")
        .map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line) || "&nbsp;"}</p>`)
        .join(""),
    });

    if (resendError) {
      console.error("Resend API error:", resendError);
      return json(
        {
          ok: false,
          error: resendError.message || "فشل إرسال البريد عبر Resend",
        },
        502
      );
    }

    return json({
      ok: true,
      via: "resend",
      id: data?.id,
      to: toEmail,
      toName,
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : "خطأ غير متوقع";
    console.error("Edge function fatal error:", e);
    return json({ ok: false, error: errMsg }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}