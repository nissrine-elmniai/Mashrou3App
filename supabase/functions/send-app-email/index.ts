// Deploy: npx supabase functions deploy send-app-email
// Secrets: SMTP_USER + SMTP_PASS (recommandé, n'importe quel destinataire)
// Optionnel: SMTP_HOST, SMTP_PORT, SMTP_SECURE, FROM_NAME
// Repli: RESEND_API_KEY (mode test = un seul destinataire)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  htmlFromText,
  sendTransactionalEmail,
} from "../_shared/sendMail.ts";

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

    const sent = await sendTransactionalEmail({
      to: toEmail,
      subject,
      text: message,
      html: htmlFromText(message),
    });

    if (!sent.ok) {
      return json({ ok: false, error: sent.error }, 502);
    }

    return json({
      ok: true,
      via: sent.via,
      id: sent.id,
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
