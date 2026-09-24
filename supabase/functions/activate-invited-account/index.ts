// Active un compte invité (membre ou superviseur) SANS passer par
// supabase.auth.signUp — qui tente d'envoyer un e-mail de confirmation
// via SMTP Auth (souvent en panne → erreur « تعذر إرسال بريد التأكيد »).
//
// Deploy:
//   npx supabase functions deploy activate-invited-account --no-verify-jwt
//
// Sécurité : uniquement si une invitation / demande acceptée existe en base
// (member_applications.status = invited | supervisor_invitations.status = pending).
// Si le compte Auth existe déjà : on vérifie le mot de passe fourni, on ne
// le réécrit jamais (évite la prise de compte pendant la fenêtre d'invitation).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 8;
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
  return forwarded.split(",")[0].trim() || "unknown";
}

function canonicalEmail(email: string) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail) return "";
  return mail.replace(/\+supervisor(?=@)/i, "");
}

function authEmailForRole(email: string, role: string) {
  const canonical = canonicalEmail(email);
  if (!canonical || !canonical.includes("@")) return canonical;
  if (role === "supervisor") {
    const at = canonical.indexOf("@");
    const local = canonical.slice(0, at);
    const domain = canonical.slice(at + 1);
    if (local.toLowerCase().endsWith("+supervisor")) return canonical;
    return `${local}+supervisor@${domain}`;
  }
  return canonical;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const role = String(body.role || "member").trim().toLowerCase();
    const password = String(body.password || "");
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const displayEmail = canonicalEmail(body.email || "");

    if (!displayEmail || !displayEmail.includes("@")) {
      return json({ ok: false, error: "أدخل بريداً إلكترونياً صالحاً" }, 200);
    }
    if (isRateLimited(`email:${displayEmail}`) || isRateLimited(`ip:${clientIp(req)}`)) {
      return json({ ok: false, error: "حاول مرة أخرى لاحقاً" }, 200);
    }
    if (password.length < 8) {
      return json(
        { ok: false, error: "كلمة المرور قصيرة جداً (8 أحرف على الأقل)" },
        200
      );
    }
    if (role !== "member" && role !== "supervisor") {
      return json({ ok: false, error: "دور غير صالح" }, 200);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    let memberAppRow: Record<string, unknown> | null = null;
    let supervisorInvRow: Record<string, unknown> | null = null;

    if (role === "member") {
      const { data: apps, error: appErr } = await admin
        .from("member_applications")
        .select(
          "id, email, full_name, first_name, last_name, status, genre, phone, school, level, hifz_amount, kind"
        )
        .ilike("email", displayEmail)
        .order("updated_at", { ascending: false })
        .limit(5);

      if (appErr) {
        console.error("member_applications:", appErr.message);
        return json({ ok: false, error: "تعذر التحقق من الدعوة" }, 200);
      }

      const list = apps || [];
      const isJoinApp = (a) =>
        !a.kind || a.kind === "join" || a.kind === null;
      const invited = list.find((a) => a.status === "invited" && isJoinApp(a));
      if (!invited) {
        const pending = list.find((a) => a.status === "pending" && isJoinApp(a));
        const activated = list.find(
          (a) => a.status === "activated" && isJoinApp(a)
        );
        if (activated) {
          return json(
            {
              ok: false,
              error:
                "الحساب مفعّل مسبقاً لهذا البريد. سجّل الدخول أو استخدم استعادة كلمة المرور",
            },
            200
          );
        }
        if (pending) {
          return json(
            {
              ok: false,
              error:
                "طلبك ما زال قيد المراجعة. انتظر قبول الإدارة ثم أنشئ الحساب",
            },
            200
          );
        }
        return json(
          {
            ok: false,
            error:
              "لا توجد دعوة مقبولة لهذا البريد. تأكد أن الإدارة قبلت طلبك بهذا البريد",
          },
          200
        );
      }
      memberAppRow = invited;
    } else {
      const { data: inv, error: invErr } = await admin
        .from("supervisor_invitations")
        .select("id, email, first_name, last_name, status")
        .ilike("email", displayEmail)
        .eq("status", "pending")
        .maybeSingle();

      if (invErr) {
        console.error("supervisor_invitations:", invErr.message);
        return json({ ok: false, error: "تعذر التحقق من دعوة المشرف" }, 200);
      }
      if (!inv) {
        return json(
          {
            ok: false,
            error: "لا توجد دعوة مشرف لهذا البريد أو الحساب مفعّل مسبقاً",
          },
          200
        );
      }
      supervisorInvRow = inv as Record<string, unknown>;
    }

    const authMail = authEmailForRole(displayEmail, role);
    const meta = {
      role,
      first_name: firstName,
      last_name: lastName,
      account_status: "active",
      canonical_email: displayEmail,
    };

    let userId: string | null = null;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: authMail,
      password,
      email_confirm: true,
      user_metadata: meta,
    });

    if (createErr) {
      const already =
        /already registered|already exists|duplicate|email_exists/i.test(
          createErr.message || ""
        );
      if (!already) {
        return json(
          { ok: false, error: createErr.message || "تعذر إنشاء الحساب" },
          200
        );
      }

      // Compte déjà créé : on NE change PAS le mot de passe (prise de compte).
      // Relier l'invitation seulement si le mot de passe fourni est le bon
      // (nouvelle tentative après un createUser réussi mais un lien invitation raté).
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      if (!anonKey) {
        return json(
          {
            ok: false,
            error:
              "هذا البريد مسجّل مسبقاً. سجّل الدخول أو استخدم استعادة كلمة المرور",
          },
          200
        );
      }
      const anon = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signed, error: signErr } = await anon.auth.signInWithPassword({
        email: authMail,
        password,
      });
      if (signErr || !signed?.user?.id) {
        return json(
          {
            ok: false,
            error:
              "هذا البريد مسجّل مسبقاً. سجّل الدخول أو استخدم استعادة كلمة المرور",
          },
          200
        );
      }
      userId = signed.user.id;
      await admin.auth.admin.updateUserById(userId, {
        email_confirm: true,
        user_metadata: meta,
      });
    } else {
      userId = created.user!.id;
    }

    const now = new Date().toISOString();
    const profilePayload: Record<string, unknown> = {
      id: userId,
      email: authMail,
      canonical_email: displayEmail,
      role,
      roles: [role],
      account_status: "active",
      first_name:
        firstName ||
        memberAppRow?.first_name ||
        supervisorInvRow?.first_name ||
        null,
      last_name:
        lastName ||
        memberAppRow?.last_name ||
        supervisorInvRow?.last_name ||
        null,
      updated_at: now,
    };
    if (memberAppRow) {
      if (memberAppRow.genre) profilePayload.genre = memberAppRow.genre;
      if (memberAppRow.phone) profilePayload.phone = memberAppRow.phone;
      if (memberAppRow.school) profilePayload.school = memberAppRow.school;
      if (memberAppRow.level) profilePayload.level = memberAppRow.level;
      if (memberAppRow.hifz_amount) {
        profilePayload.hifz_amount = memberAppRow.hifz_amount;
      }
    }

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" })
      .select("*")
      .single();

    if (profileErr) {
      console.error("profiles upsert:", profileErr.message);
    }

    if (role === "member") {
      // Activer uniquement la demande d'intégration (join), pas un renouvellement saison
      const { error: appUpdateErr } = await admin
        .from("member_applications")
        .update({
          status: "activated",
          user_id: userId,
          activated_at: now,
          updated_at: now,
        })
        .eq("id", String(memberAppRow.id));

      if (appUpdateErr) {
        console.error("member_applications activate:", appUpdateErr.message);
        return json(
          {
            ok: false,
            error:
              "تم إنشاء الحساب لكن تعذر تفعيل طلب الانضمام — أعد المحاولة أو راجع الإدارة",
          },
          200
        );
      }
    } else {
      const { error: invUpdateErr } = await admin
        .from("supervisor_invitations")
        .update({ status: "activated", updated_at: now })
        .ilike("email", displayEmail)
        .eq("status", "pending");
      if (invUpdateErr) {
        console.error("supervisor_invitations activate:", invUpdateErr.message);
        return json(
          {
            ok: false,
            error:
              "تم إنشاء الحساب لكن تعذر تحديث دعوة المشرف — أعد المحاولة",
          },
          200
        );
      }
    }

    return json({
      ok: true,
      authUser: { id: userId, email: authMail },
      profile: profile || null,
      needsEmailConfirmation: false,
    });
  } catch (e) {
    return json(
      { ok: false, error: (e as Error)?.message || "خطأ غير متوقع" },
      200
    );
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
