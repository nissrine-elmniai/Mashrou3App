import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

const SUPABASE_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} — انتهت المهلة (${Math.round(ms / 1000)}ث)`)),
        ms
      );
    }),
  ]);
}

function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  if (/null value in column ["'](\w+)["']/i.test(msg)) {
    const col = msg.match(/null value in column ["'](\w+)["']/i)?.[1] || "مطلوب";
    return `عمود ${col} مطلوب — أعد تحميل التطبيق (يرسل title/message/body) أو نفّذ 0022`;
  }
  if (/Could not find the ['"]?message['"]? column|schema cache/i.test(msg)) {
    return "عمود message ناقص في جدول alerts — نفّذ ملف 0021_alerts_align_columns.sql في SQL Editor ثم أعد المحاولة";
  }
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/duplicate key|23505/i.test(msg)) {
    return "سجل مكرر — هذه العملية مسجلة مسبقاً";
  }
  return mapSupabaseAuthError(error);
}

/**
 * Alertes non encore acquittées par l'utilisateur connecté, dans l'ordre
 * FIFO (la plus ancienne d'abord — à afficher en premier par la passerelle
 * bloquante). La RLS n'expose que les alertes dont l'audience couvre le rôle
 * de l'appelant (0014). @returns { ok, alerts: [] }
 */
export async function getUnacknowledgedAlerts() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const [alertsRes, acksRes] = await Promise.all([
      withTimeout(
        supabase
          .from("alerts")
        .select("id, message, title, body, created_at")
        .order("created_at", { ascending: true }),
        SUPABASE_TIMEOUT_MS,
        "قراءة التنبيهات"
      ),
      withTimeout(
        supabase
          .from("alert_acknowledgments")
          .select("alert_id"),
        SUPABASE_TIMEOUT_MS,
        "قراءة الإقرارات"
      ),
    ]);

    if (alertsRes.error || acksRes.error) {
      return {
        ok: false,
        error: mapTableError(alertsRes.error || acksRes.error, "alerts"),
      };
    }

    const acked = new Set((acksRes.data || []).map((a) => a.alert_id));
    const pending = (alertsRes.data || []).filter((a) => !acked.has(a.id));
    return {
      ok: true,
      alerts: pending.map((a) => ({
        id: a.id,
        message: a.message || a.body || a.title || "",
        createdAt: a.created_at,
      })),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Acquitte une alerte (insertion d'une ligne alert_acknowledgments pour son
 * propre compte). Idempotent : un doublon (PK alert_id + member_id) est
 * considéré comme un succès. @returns { ok }
 */
export async function acknowledgeAlert(alertId) {
  const authId = await currentAuthId();
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!alertId) {
    return { ok: false, error: "معرّف تنبيه غير صالح" };
  }
  try {
    const { error } = await withTimeout(
      supabase.from("alert_acknowledgments").insert({
        alert_id: alertId,
        member_id: authId,
      }),
      SUPABASE_TIMEOUT_MS,
      "تسجيل الإقرار"
    );
    if (error && !/duplicate key|23505/i.test(error?.message || "")) {
      return { ok: false, error: mapTableError(error, "alert_acknowledgments") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Émission d'une alerte via le RPC réservé aux admins (0014).
 * @param {string} message texte de l'alerte
 * @param {"all"|"members"|"supervisors"} audience public destinataire
 * @returns { ok }
 */
export async function sendAlert(message, audience) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const text = String(message || "").trim();
  if (!text) {
    return { ok: false, error: "اكتب نص التنبيه أولاً" };
  }
  const allowed = ["all", "members", "supervisors"];
  const target = allowed.includes(audience) ? audience : "all";
  const title = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  const id =
    (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : null) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const { data: authData } = await supabase.auth.getUser();
    const row = {
      id,
      title,
      message: text,
      body: text,
      audience: target,
      created_by: authData?.user?.id || null,
    };

    // Schéma legacy : title + body souvent NOT NULL
    let insertError = (
      await withTimeout(
        supabase.from("alerts").insert(row),
        SUPABASE_TIMEOUT_MS,
        "إرسال التنبيه"
      )
    ).error;

    // Si une colonne n'existe pas dans le cache, retenter sans elle
    if (insertError && /Could not find the ['"](\w+)['"] column/i.test(insertError.message || "")) {
      const badCol = RegExp.$1;
      const slim = { ...row };
      delete slim[badCol];
      insertError = (
        await withTimeout(
          supabase.from("alerts").insert(slim),
          SUPABASE_TIMEOUT_MS,
          "إرسال التنبيه"
        )
      ).error;
    }

    if (!insertError) return { ok: true };

    // Repli RPC (après migration 0022)
    const { error: rpcError } = await withTimeout(
      supabase.rpc("send_alert", { p_message: text, p_audience: target }),
      SUPABASE_TIMEOUT_MS,
      "إرسال التنبيه"
    );
    if (!rpcError) return { ok: true };

    return {
      ok: false,
      error: mapTableError(insertError || rpcError, "alerts"),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Historique complet des alertes avec nb d'acquittements.
 * @returns { ok, alerts: [{ id, message, audience, created_at, ackCount }] }
 */
export async function getAllAlertsAdmin() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("alerts")
        .select("id, message, title, body, audience, created_at"),
      SUPABASE_TIMEOUT_MS,
      "قراءة سجل التنبيهات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "alerts") };
    }

    const withCounts = await Promise.all(
      (data || []).map(async (a) => {
        const { count, error: countError } = await withTimeout(
          supabase
            .from("alert_acknowledgments")
            .select("alert_id", { count: "exact", head: true })
            .eq("alert_id", a.id),
          SUPABASE_TIMEOUT_MS,
          "قراءة عدد الإقرارات"
        );
        return {
          id: a.id,
          message: a.message || a.body || a.title || "",
          audience: a.audience,
          createdAt: a.created_at,
          ackCount: countError ? 0 : count || 0,
        };
      })
    );

    return { ok: true, alerts: withCounts };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Alertes visibles par le compte connecté (RLS filtre déjà l'audience).
 * Sert aux listes membre / superviseur.
 * @returns { ok, alerts }
 */
export async function getVisibleAlerts() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("alerts")
        .select("id, message, title, body, audience, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      SUPABASE_TIMEOUT_MS,
      "قراءة التنبيهات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "alerts") };
    }
    return {
      ok: true,
      alerts: (data || []).map((a) => ({
        id: a.id,
        message: a.message || a.body || a.title || "",
        audience: a.audience,
        createdAt: a.created_at,
      })),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Realtime : nouvel INSERT sur alerts (filtré par RLS — seuls les destinataires
 * reçoivent l'événement). @returns {() => void}
 */
export function subscribeToNewAlerts(onInsert) {
  if (!isSupabaseConfigured() || typeof onInsert !== "function") {
    return () => {};
  }
  const channel = supabase.channel(`alerts_inbox_${Date.now()}`);
  channel
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "alerts" },
      (payload) => {
        if (payload?.new) onInsert(payload.new);
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Id de l'utilisateur connecté via la session Supabase, ou null. */
async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}