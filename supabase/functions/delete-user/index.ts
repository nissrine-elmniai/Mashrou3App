// Supabase Edge Function — suppression d'un compte utilisateur (destructive)
// Deploy (SANS --no-verify-jwt, à l'identique de send-app-email) :
//   supabase functions deploy delete-user
//
// Sécurité : la fonction exige un JWT utilisateur VALIDE (contrairement à
// send-password-reset, déployée --no-verify-jwt) et vérifie que le compte
// appelant a le rôle 'admin' — même pattern que send-app-email :
// client anon + header Authorization transmis + auth.getUser +
// profiles.role. La suppression réelle passe par le service_role
// (admin.auth.admin.deleteUser) : la suppression de l'utilisateur Auth
// cascade sur profiles (profiles.id -> auth.users on delete cascade) puis
// sur inscriptions / progression (on delete cascade), test_invitations
// (on delete cascade — migration 0015) et test_resultats (via
// test_invitations, cascade 0005), seances.superviseur_id (set null) et
// member_applications.user_id (set null, FK vers auth.users).
//
// Les FK NO ACTION vers profiles sont purgées AVANT le deleteUser, dans le
// bon ordre, via le client service_role : messages.sender_id/recipient_id
// (0006), test_resultats.noted_by (0005), tests.created_by (0005).
// test_invitations (côté membre) n'a pas besoin de purge manuelle : le
// cascade 0015 la supprime avec le profil.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // Seul le rôle admin peut supprimer un compte (destructif).
    const { data: profile } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "admin") {
      return json({ ok: false, error: "أدمن فقط يمكنه حذف الحسابات" }, 403);
    }

    const body = await req.json();
    const userId = String(body.userId || "").trim();
    if (!UUID_RE.test(userId)) {
      return json({ ok: false, error: "معرّف المستخدم غير صالح" }, 400);
    }
    if (userId === user.id) {
      return json({ ok: false, error: "لا يمكنك حذف حسابك الحالي" }, 400);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Purgé des FK NO ACTION (messages / tests / test_resultats) :
    // ordre dépendant avant la cascade auth -> profiles.
    const { error: msgError } = await admin
      .from("messages")
      .delete()
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
    if (msgError) {
      console.error("delete messages:", msgError.message);
    }
    const { error: resError } = await admin
      .from("test_resultats")
      .delete()
      .eq("noted_by", userId);
    if (resError) {
      console.error("delete test_resultats:", resError.message);
    }
    const { error: testError } = await admin
      .from("tests")
      .delete()
      .eq("created_by", userId);
    if (testError) {
      console.error("delete tests:", testError.message);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json(
        { ok: false, error: `فشل حذف الحساب: ${deleteError.message}` },
        502
      );
    }

    return json({ ok: true });
  } catch (e) {
    return json(
      { ok: false, error: e?.message || "خطأ غير متوقع في حذف الحساب" },
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
