// Supabase Edge Function — envoi d'e-mails via Resend
// Deploy: supabase functions deploy send-app-email
// Secret: supabase secrets set RESEND_API_KEY=re_xxx
// Optionnel: supabase secrets set FROM_EMAIL="Nom <noreply@votredomaine.com>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
      return json({ ok: false, error: "جلسة غير صالحة" }, 401);
    }

    // Seuls admin / supervisor peuvent envoyer
    const { data: profile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || !["admin", "supervisor"].includes(profile.role)) {
      return json({ ok: false, error: "ليس لديك صلاحية إرسال البريد" }, 403);
    }

    const body = await req.json();
    const toEmail = String(body.toEmail || "").trim().toLowerCase();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    const toName = String(body.toName || "").trim();

    if (!toEmail || !subject || !message) {
      return json(
        { ok: false, error: "بيانات البريد غير مكتملة" },
        400
      );
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return json(
        {
          ok: false,
          error:
            "RESEND_API_KEY غير مُعدّ. أضفه عبر: supabase secrets set RESEND_API_KEY=...",
        },
        500
      );
    }

    const fromEmail =
      Deno.env.get("FROM_EMAIL") ||
      "مهندس حامل لكتاب الله <onboarding@resend.dev>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        text: message,
        html: message
          .split("\n")
          .map((line: string) => `<p style="margin:0 0 8px;">${escapeHtml(line) || "&nbsp;"}</p>`)
          .join(""),
      }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      const errMsg =
        resendData?.message ||
        resendData?.error ||
        "فشل إرسال البريد عبر Resend";
      return json({ ok: false, error: String(errMsg) }, 502);
    }

    return json({
      ok: true,
      via: "resend",
      id: resendData.id,
      to: toEmail,
      toName,
    });
  } catch (e) {
    return json(
      { ok: false, error: e?.message || "خطأ غير متوقع في إرسال البريد" },
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

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
