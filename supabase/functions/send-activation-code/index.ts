// Envoie un OTP d'activation (6 chiffres, 15 min) si une invitation existe.
// Ne crée pas l'utilisateur Auth.
//
// Deploy:
//   npx supabase functions deploy send-activation-code --no-verify-jwt
//
// Le message part par sendTransactionalEmail, le même envoi que
// send-app-email. send-app-email lui-même exige un JWT admin ou
// superviseur : l'invité n'en a pas encore.
//
// Réponse { ok: true } que l'adresse soit invitée ou non (pas d'énumération).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendTransactionalEmail } from "../_shared/sendMail.ts";
import {
  canonicalActivationEmail,
  generateActivationCode,
  hashActivationCode,
} from "../_shared/activationCode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 3;
const CODE_TTL_MS = 15 * 60 * 1000;
const rateHits = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const prev = (rateHits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (prev.length >= RATE_MAX) {
    rateHits.set(key, prev);
    return true;
  }
  prev.push(now);
  rateHits.set(key, prev);
  return false;
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return (
    forwarded.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function neutral() {
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const role = String(body.role || "").trim().toLowerCase();
    const email = canonicalActivationEmail(body.email || "");

    if (!email || !email.includes("@")) {
      return json({ ok: false, error: "أدخل بريداً إلكترونياً صالحاً" }, 400);
    }
    if (role !== "member" && role !== "supervisor") {
      return json({ ok: false, error: "دور غير صالح" }, 400);
    }

    if (isRateLimited(`email:${email}:${role}`) || isRateLimited(`ip:${clientIp(req)}`)) {
      return neutral();
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const invited = await hasPendingInvitation(admin, email, role);
    if (!invited) {
      return neutral();
    }

    const code = generateActivationCode();
    const codeHash = await hashActivationCode(email, role, code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();

    const { data: inserted, error: insertError } = await admin
      .from("activation_codes")
      .insert({
        email,
        code_hash: codeHash,
        role,
        expires_at: expiresAt,
        attempts: 0,
      })
      .select("id")
      .single();
    if (insertError || !inserted?.id) {
      console.error("insert activation code:", insertError?.message || "no id");
      return neutral();
    }

    const { error: retireError } = await admin
      .from("activation_codes")
      .update({ consumed_at: now.toISOString() })
      .eq("email", email)
      .eq("role", role)
      .is("consumed_at", null)
      .neq("id", inserted.id);
    if (retireError) {
      console.error("retire activation codes:", retireError.message);
    }

    const subject = "رمز تفعيل الحساب — مهندس حامل لكتاب الله";
    const text = [
      "السلام عليكم،",
      "",
      "رمز التحقق لتفعيل حسابك:",
      code,
      "",
      "أدخل هذا الرمز في التطبيق مع كلمة المرور الجديدة.",
      "صلاحية الرمز 15 دقيقة.",
      "إذا لم تطلب ذلك، تجاهل هذه الرسالة.",
    ].join("\n");
    const html = `
      <div dir="rtl">
        <p>السلام عليكم،</p>
        <p>رمز التحقق لتفعيل حسابك:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p>
        <p>أدخل هذا الرمز في التطبيق مع كلمة المرور الجديدة.</p>
        <p>صلاحية الرمز 15 دقيقة.</p>
        <p>إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>
      </div>
    `;

    const sent = await sendTransactionalEmail({
      to: email,
      subject,
      text,
      html,
    });
    if (!sent.ok) {
      console.error("activation mail:", sent.error);
    }

    return neutral();
  } catch (e) {
    console.error("send-activation-code:", (e as Error)?.message || e);
    return neutral();
  }
});

async function hasPendingInvitation(
  admin: ReturnType<typeof createClient>,
  email: string,
  role: string
): Promise<boolean> {
  if (role === "supervisor") {
    const { data, error } = await admin
      .from("supervisor_invitations")
      .select("id")
      .ilike("email", email)
      .eq("status", "pending")
      .limit(1);
    if (error) {
      console.error("supervisor_invitations:", error.message);
      return false;
    }
    return (data || []).length > 0;
  }

  const { data, error } = await admin
    .from("member_applications")
    .select("id, status, kind")
    .ilike("email", email)
    .eq("status", "invited")
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) {
    console.error("member_applications:", error.message);
    return false;
  }
  return (data || []).some(
    (row) => !row.kind || row.kind === "join" || row.kind === null
  );
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
