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
// (on delete cascade — migration 0015 ; la note est sur cette ligne),
// seances.superviseur_id (set null) et member_applications.user_id
// (set null, FK vers auth.users).
//
// Les FK NO ACTION vers profiles sont purgées AVANT le deleteUser, dans le
// bon ordre, via le client service_role : messages.sender_id/recipient_id
// (0006), tests.created_by (0005, sans ON DELETE). Supprimer ces tests
// emporte leurs invitations (test_id ON DELETE CASCADE, 0005).
// test_invitations d'un membre supprimé partent avec le profil (0015).

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

    const { data: targetProfile, error: profileReadError } = await admin
      .from("profiles")
      .select("email, canonical_email")
      .eq("id", userId)
      .maybeSingle();
    if (profileReadError) {
      console.error("lookup profile email:", profileReadError.message);
    }

    // seances.superviseur_id est NOT NULL (schéma live) alors que la FK est
    // ON DELETE SET NULL. deleteUser échoue alors avec une violation
    // not-null. On refuse avant, avec le nom des séances concernées.
    const { data: ownedSeances, error: seanceLookupError } = await admin
      .from("seances")
      .select("nom")
      .eq("superviseur_id", userId);
    if (seanceLookupError) {
      console.error("lookup seances:", seanceLookupError.message);
    } else if (ownedSeances && ownedSeances.length > 0) {
      const labels = ownedSeances
        .map((row) => String(row.nom || "").trim())
        .filter(Boolean)
        .map((nom) => `«${nom}»`);
      const detail =
        labels.length === 1
          ? `بحصة ${labels[0]}`
          : labels.length > 1
            ? `بالحصص ${labels.join("، ")}`
            : "بحصة";
      return json(
        {
          ok: false,
          error: `لا يمكن حذف هذا المشرف لأنه مرتبط ${detail}. عيّن مشرفاً آخر من صفحة الحصص، ثم أعد الحذف.`,
        },
        409
      );
    }

    // Purgé des FK NO ACTION avant la cascade auth -> profiles.
    // storage.objects.owner référence auth.users sans ON DELETE : une photo
    // de profil bloque deleteUser. Les colonnes legacy from_user_id /
    // to_user_id aussi, si elles existent encore.
    const storageError = await removeUserStorage(admin, userId);
    if (storageError) {
      return json({ ok: false, error: `فشل حذف ملفات الحساب: ${storageError}` }, 502);
    }
    const msgError = await purgeMessages(admin, userId);
    if (msgError) {
      return json({ ok: false, error: `فشل حذف الرسائل: ${msgError}` }, 502);
    }
    const testError = await purgeCreatedTests(admin, userId);
    if (testError) {
      return json({ ok: false, error: `فشل حذف الاختبارات: ${testError}` }, 502);
    }
    await admin.from("test_resultats").delete().eq("noted_by", userId);

    let { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError && /objects_owner|storage\.objects|owner_id/i.test(deleteError.message || "")) {
      await removeUserStorage(admin, userId);
      ({ error: deleteError } = await admin.auth.admin.deleteUser(userId));
    }
    if (deleteError) {
      const detail = deleteError.message || "";
      if (
        /superviseur_id/i.test(detail) &&
        /not-null|null value|foreign key|23502|23503/i.test(detail)
      ) {
        return json(
          {
            ok: false,
            error:
              "لا يمكن حذف هذا المشرف لأنه مرتبط بحصة. عيّن مشرفاً آخر من صفحة الحصص، ثم أعد الحذف.",
          },
          409
        );
      }
      return json(
        { ok: false, error: `فشل حذف الحساب: ${detail}` },
        502
      );
    }

    const revokeError = await revokeSupervisorInvitations(admin, targetProfile);
    if (revokeError) {
      return json(
        {
          ok: false,
          error: `تم حذف الحساب لكن تعذر إلغاء الدعوة: ${revokeError}`,
        },
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

async function revokeSupervisorInvitations(
  admin: ReturnType<typeof createClient>,
  profile: { email?: string | null; canonical_email?: string | null } | null
): Promise<string | null> {
  const emails = [
    ...new Set(
      [profile?.email, profile?.canonical_email]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => value.includes("@"))
    ),
  ];
  if (!emails.length) return null;

  const orFilter = emails.map((email) => `email.ilike.${email}`).join(",");
  const { error } = await admin
    .from("supervisor_invitations")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .or(orFilter)
    .neq("status", "revoked");
  if (!error) return null;
  console.error("revoke invitations:", error.message);
  return error.message || "تعذر إلغاء الدعوة";
}

function ignorableMissingColumn(message: string) {
  return /does not exist|schema cache|Could not find the|column .* does not exist/i.test(
    message
  );
}

async function purgeMessages(
  admin: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const filters = [
    `sender_id.eq.${userId},recipient_id.eq.${userId}`,
    `from_user_id.eq.${userId},to_user_id.eq.${userId}`,
  ];
  for (const filter of filters) {
    const { error } = await admin.from("messages").delete().or(filter);
    if (!error) continue;
    const message = error.message || "";
    if (ignorableMissingColumn(message)) continue;
    console.error("delete messages:", message);
    return message;
  }
  return null;
}

async function purgeCreatedTests(
  admin: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data: tests, error: lookupError } = await admin
    .from("tests")
    .select("id")
    .eq("created_by", userId);
  if (lookupError) {
    const message = lookupError.message || "";
    if (ignorableMissingColumn(message)) return null;
    return message;
  }
  const ids = (tests || []).map((row) => row.id).filter(Boolean);
  if (!ids.length) return null;

  const { error: dateError } = await admin
    .from("test_invitations")
    .update({ date_choisie: null })
    .in("test_id", ids);
  if (dateError && !ignorableMissingColumn(dateError.message || "")) {
    console.error("clear test dates:", dateError.message);
  }

  const { error: deleteError } = await admin.from("tests").delete().in("id", ids);
  if (!deleteError) return null;
  const message = deleteError.message || "";
  if (ignorableMissingColumn(message)) return null;
  console.error("delete tests:", message);
  return message;
}

async function removeUserStorage(
  admin: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { error: avatarError } = await admin.storage.from("avatars").remove([
    `${userId}.jpg`,
    `${userId}.jpeg`,
    `${userId}.png`,
  ]);
  if (avatarError) {
    console.error("remove avatar:", avatarError.message);
  }

  const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
  if (bucketError) {
    console.error("listBuckets:", bucketError.message);
    return null;
  }

  for (const bucket of buckets || []) {
    const bucketId = bucket.id || bucket.name;
    if (!bucketId) continue;
    const { data: files, error: listError } = await admin.storage
      .from(bucketId)
      .list("", { limit: 1000, search: userId });
    if (listError) {
      console.error("list storage", bucketId, listError.message);
      continue;
    }
    const names = (files || [])
      .map((file) => file.name)
      .filter((name) => !!name && name.includes(userId));
    if (!names.length) continue;
    const { error: removeError } = await admin.storage.from(bucketId).remove(names);
    if (removeError) {
      console.error("remove storage", bucketId, removeError.message);
      return removeError.message;
    }
  }
  return null;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
