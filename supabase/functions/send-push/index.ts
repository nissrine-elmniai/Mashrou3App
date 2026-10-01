// Deploy :
//   npx supabase functions deploy send-push
// Secrets auto : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Secret dédié : PUSH_DISPATCH_SECRET (en-tête x-dispatch-secret).
// Authorization Bearer reste le JWT service_role pour la passerelle verify_jwt.
// Auth dispatch : x-dispatch-secret === PUSH_DISPATCH_SECRET (constant-time, pas de JWT).
// Claim atomique : RPC claim_pending_push_notifications (SKIP LOCKED).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 3;

const CATEGORY_COLUMNS: Record<string, string> = {
  chat: "chat",
  presence: "presence",
  inscriptions: "inscriptions",
  seances: "seances",
  progression: "progression",
  alertes: "alertes",
  systeme: "systeme",
};

type NotificationRow = {
  id: string;
  user_id: string;
  category: string;
  event_type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  push_sent_at: string | null;
  push_attempts: number;
  read_at?: string | null;
};

type PushTokenRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
};

type PrefsRow = Record<string, boolean | string | null>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true }, 200);
  }

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET") || "";
    if (!serviceKey || !supabaseUrl || !dispatchSecret) {
      return json({ ok: false, error: "إعدادات الخادم ناقصة" }, 500);
    }

    const auth = authorizeServiceRole(
      req.headers.get("x-dispatch-secret"),
      dispatchSecret
    );
    if (!auth.ok) {
      console.error("send-push 401:", auth.reason);
      return json({ ok: false, error: "غير مصرح" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    let requestedIds: string[] = [];
    try {
      const body = await req.json();
      if (Array.isArray(body?.ids)) {
        requestedIds = body.ids.map((id: unknown) => String(id)).filter(Boolean);
      }
    } catch {
      requestedIds = [];
    }

    const { data: rows, error: claimError } = await admin.rpc(
      "claim_pending_push_notifications",
      {
        p_ids: requestedIds.length > 0 ? requestedIds : null,
        p_limit: 200,
      }
    );
    if (claimError) {
      console.error("claim_pending_push_notifications:", claimError.message);
      return json({ ok: false, error: claimError.message }, 500);
    }

    const pending = ((rows || []) as NotificationRow[]).filter(
      (row) => row?.id && !row.push_sent_at
    );
    if (pending.length === 0) {
      return json({ ok: true, processed: 0, sent: 0 });
    }

    const userIds = [...new Set(pending.map((r) => r.user_id))];

    const [{ data: prefsRows }, { data: tokenRows }] = await Promise.all([
      admin.from("notification_preferences").select("*").in("user_id", userIds),
      admin
        .from("push_tokens")
        .select("id, user_id, expo_push_token")
        .in("user_id", userIds),
    ]);

    const prefsByUser = new Map<string, PrefsRow>();
    for (const row of prefsRows || []) {
      prefsByUser.set(String(row.user_id), row as PrefsRow);
    }
    const tokensByUser = new Map<string, PushTokenRow[]>();
    for (const row of (tokenRows || []) as PushTokenRow[]) {
      const list = tokensByUser.get(row.user_id) || [];
      list.push(row);
      tokensByUser.set(row.user_id, list);
    }

    let sent = 0;
    const expoMessages: Array<{
      notificationId: string;
      tokenId: string;
      token: string;
      message: Record<string, unknown>;
    }> = [];

    for (const row of pending) {
      const col = CATEGORY_COLUMNS[row.category];
      const prefs = prefsByUser.get(row.user_id);
      const enabled = !col || prefs == null || prefs[col] !== false;

      if (!enabled) {
        await markProcessed(admin, row.id, row.push_attempts, {
          terminal: true,
          error: null,
        });
        continue;
      }

      if (row.read_at) {
        await markProcessed(admin, row.id, row.push_attempts, {
          terminal: true,
          error: null,
        });
        continue;
      }

      const tokens = tokensByUser.get(row.user_id) || [];
      if (tokens.length === 0) {
        await markProcessed(admin, row.id, row.push_attempts, {
          terminal: true,
          error: "no_token",
        });
        continue;
      }

      for (const tok of tokens) {
        expoMessages.push({
          notificationId: row.id,
          tokenId: tok.id,
          token: tok.expo_push_token,
          message: {
            to: tok.expo_push_token,
            title: row.title,
            body: row.body,
            sound: "default",
            channelId: "default",
            data: {
              notificationId: row.id,
              category: row.category,
              event_type: row.event_type,
              ...(row.payload && typeof row.payload === "object"
                ? row.payload
                : {}),
            },
          },
        });
      }
    }

    const ticketsByNotification = new Map<
      string,
      { ok: boolean; error: string | null; deadTokenIds: string[]; terminal: boolean }
    >();

    for (let i = 0; i < expoMessages.length; i += BATCH_SIZE) {
      const batch = expoMessages.slice(i, i + BATCH_SIZE);
      const tickets = await sendExpoBatch(batch.map((b) => b.message));
      tickets.forEach((ticket, idx) => {
        const item = batch[idx];
        if (!item) return;
        const prev = ticketsByNotification.get(item.notificationId) || {
          ok: false,
          error: null,
          deadTokenIds: [],
          terminal: false,
        };
        if (ticket.status === "ok") {
          prev.ok = true;
        } else {
          const errCode = ticket.details?.error || ticket.message || "expo_error";
          prev.error = String(errCode);
          if (errCode === "DeviceNotRegistered") {
            prev.deadTokenIds.push(item.tokenId);
            prev.terminal = true;
          }
        }
        ticketsByNotification.set(item.notificationId, prev);
      });
    }

    const deadIds = [
      ...new Set(
        [...ticketsByNotification.values()].flatMap((t) => t.deadTokenIds)
      ),
    ];
    if (deadIds.length > 0) {
      const { error: delErr } = await admin
        .from("push_tokens")
        .delete()
        .in("id", deadIds);
      if (delErr) {
        console.error("delete dead tokens:", delErr.message);
      }
    }

    const handled = new Set<string>();
    for (const row of pending) {
      if (handled.has(row.id)) continue;
      const ticket = ticketsByNotification.get(row.id);
      if (!ticket) continue;
      handled.add(row.id);
      if (ticket.ok) {
        sent += 1;
        await markProcessed(admin, row.id, row.push_attempts, {
          terminal: true,
          error: null,
        });
      } else {
        const onlyDead =
          ticket.terminal &&
          ticket.error === "DeviceNotRegistered";
        await markProcessed(admin, row.id, row.push_attempts, {
          terminal: onlyDead,
          error: ticket.error || "expo_error",
        });
      }
    }

    return json({
      ok: true,
      processed: pending.length,
      sent,
    });
  } catch (e) {
    console.error("send-push fatal:", e);
    return json(
      { ok: false, error: e instanceof Error ? e.message : "خطأ غير متوقع" },
      500
    );
  }
});

async function markProcessed(
  admin: ReturnType<typeof createClient>,
  id: string,
  attempts: number,
  result: { terminal: boolean; error: string | null }
) {
  const nextAttempts = Math.min(attempts + 1, MAX_ATTEMPTS);
  const patch: Record<string, unknown> = {
    push_attempts: nextAttempts,
    push_error: result.error,
  };
  // Terminal : no_token, catégorie off, succès Expo, token mort.
  // Retry : uniquement échecs réseau / tickets Expo transitoires.
  if (result.terminal || nextAttempts >= MAX_ATTEMPTS) {
    patch.push_sent_at = new Date().toISOString();
  }
  const { error } = await admin.from("notifications").update(patch).eq("id", id);
  if (error) {
    console.error("markProcessed", id, error.message);
  }
}

type ExpoTicket = {
  status: string;
  message?: string;
  details?: { error?: string };
};

async function sendExpoBatch(
  messages: Record<string, unknown>[]
): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("expo http", res.status, payload);
      return messages.map(() => ({
        status: "error",
        message: `http_${res.status}`,
      }));
    }
    const tickets = Array.isArray(payload?.data) ? payload.data : [];
    return messages.map(
      (_, i) => tickets[i] || { status: "error", message: "empty_ticket" }
    );
  } catch (e) {
    console.error("expo fetch:", e);
    return messages.map(() => ({
      status: "error",
      message: e instanceof Error ? e.message : "expo_fetch",
    }));
  }
}

function authorizeServiceRole(
  dispatchHeader: string | null,
  dispatchSecret: string
): { ok: true } | { ok: false; reason: string } {
  // Secret dédié au dispatch, indépendant des rotations et du format des clés
  // Supabase (JWT eyJ… ou sb_secret_). Comparaison stricte uniquement :
  // aucun décodage de JWT non signé.
  const provided = (dispatchHeader ?? "").trim();
  if (!provided || !dispatchSecret) {
    return { ok: false, reason: "secret absent" };
  }
  if (timingSafeEqual(provided, dispatchSecret)) {
    return { ok: true };
  }
  return { ok: false, reason: "secret invalide" };
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  const len = Math.max(aa.length, bb.length);
  let mismatch = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    mismatch |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return mismatch === 0;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
