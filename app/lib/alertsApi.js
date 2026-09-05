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

function mapSenderName(row) {
  const p = row?.sender;
  const name = `${p?.first_name || ""} ${p?.last_name || ""}`.trim();
  return name || "الإدارة";
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

/** Id de l'utilisateur connecté via la session Supabase, ou null. */
async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/**
 * Date/heure d'inscription du membre (notifications + dernières activités).
 * Priorité : première inscription acceptée → profil.created_at.
 * @returns { ok, sinceIso }
 */
export async function resolveMemberAlertCutoff(authId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, sinceIso: null };
  }
  const membreId = authId || (await currentAuthId());
  if (!membreId) {
    return { ok: false, sinceIso: null };
  }

  try {
    let inscRes = await withTimeout(
      supabase
        .from("inscriptions")
        .select("date_inscription, created_at")
        .eq("membre_id", membreId)
        .eq("statut", "accepte")
        .order("date_inscription", { ascending: true })
        .limit(1)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة تاريخ التسجيل"
    );

    // Colonne date_inscription absente → repli created_at
    if (
      inscRes.error &&
      /date_inscription|column.*does not exist/i.test(inscRes.error.message || "")
    ) {
      inscRes = await withTimeout(
        supabase
          .from("inscriptions")
          .select("created_at")
          .eq("membre_id", membreId)
          .eq("statut", "accepte")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        SUPABASE_TIMEOUT_MS,
        "قراءة تاريخ التسجيل"
      );
    }

    if (!inscRes.error && inscRes.data) {
      const since =
        inscRes.data.date_inscription || inscRes.data.created_at || null;
      if (since) {
        return { ok: true, sinceIso: since };
      }
    }

    const { data: profile } = await withTimeout(
      supabase
        .from("profiles")
        .select("created_at")
        .eq("id", membreId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة ملف العضو"
    );
    if (profile?.created_at) {
      return { ok: true, sinceIso: profile.created_at };
    }

    return { ok: true, sinceIso: null };
  } catch (e) {
    return { ok: false, sinceIso: null, error: e?.message };
  }
}

/** Alias explicite pour le filtrage des activités membre. */
export const resolveMemberRegistrationCutoff = resolveMemberAlertCutoff;

function filterAlertsSince(alerts, sinceIso) {
  if (!sinceIso) return alerts || [];
  const sinceMs = new Date(sinceIso).getTime();
  if (!Number.isFinite(sinceMs)) return alerts || [];
  return (alerts || []).filter((a) => {
    const at = new Date(a.createdAt || a.created_at || 0).getTime();
    return Number.isFinite(at) && at >= sinceMs;
  });
}

/**
 * Alertes non encore acquittées par l'utilisateur connecté, dans l'ordre
 * FIFO (la plus ancienne d'abord — à afficher en premier par la passerelle
 * bloquante). La RLS n'expose que les alertes dont l'audience couvre le rôle
 * de l'appelant (0014).
 * @param {{ sinceMemberRegistration?: boolean }} [options]
 * @returns { ok, alerts: [] }
 */
export async function getUnacknowledgedAlerts(options = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const sinceMemberRegistration = !!options.sinceMemberRegistration;
    const cutoffPromise = sinceMemberRegistration
      ? resolveMemberAlertCutoff()
      : Promise.resolve({ ok: true, sinceIso: null });

    const [alertsRes, acksRes, cutoff] = await Promise.all([
      withTimeout(
        supabase
          .from("alerts")
          .select("id, message, title, body, created_at")
          .order("created_at", { ascending: true }),
        SUPABASE_TIMEOUT_MS,
        "قراءة التنبيهات"
      ),
      withTimeout(
        supabase.from("alert_acknowledgments").select("alert_id"),
        SUPABASE_TIMEOUT_MS,
        "قراءة الإقرارات"
      ),
      cutoffPromise,
    ]);

    if (alertsRes.error || acksRes.error) {
      return {
        ok: false,
        error: mapTableError(alertsRes.error || acksRes.error, "alerts"),
      };
    }

    const acked = new Set((acksRes.data || []).map((a) => a.alert_id));
    let pending = (alertsRes.data || [])
      .filter((a) => !acked.has(a.id))
      .map((a) => ({
        id: a.id,
        message: a.message || a.body || a.title || "",
        createdAt: a.created_at,
      }));

    if (sinceMemberRegistration) {
      pending = filterAlertsSince(pending, cutoff.sinceIso);
    }

    return { ok: true, alerts: pending };
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
 * @param {{ sinceMemberRegistration?: boolean, limit?: number }} [options]
 * @returns { ok, alerts }
 */
export async function getVisibleAlerts(options = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 20;
  const sinceMemberRegistration = !!options.sinceMemberRegistration;
  try {
    const cutoffPromise = sinceMemberRegistration
      ? resolveMemberAlertCutoff()
      : Promise.resolve({ ok: true, sinceIso: null });

    const [result, cutoff] = await Promise.all([
      withTimeout(
        supabase
          .from("alerts")
          .select("id, message, title, body, audience, created_at")
          .order("created_at", { ascending: false })
          .limit(Math.max(limit, 50)),
        SUPABASE_TIMEOUT_MS,
        "قراءة التنبيهات"
      ),
      cutoffPromise,
    ]);

    const { data, error } = result;
    if (error) {
      return { ok: false, error: mapTableError(error, "alerts") };
    }
    let alerts = (data || []).map((a) => ({
      id: a.id,
      message: a.message || a.body || a.title || "",
      audience: a.audience,
      createdAt: a.created_at,
    }));
    if (sinceMemberRegistration) {
      alerts = filterAlertsSince(alerts, cutoff.sinceIso);
    }
    return { ok: true, alerts: alerts.slice(0, limit) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Alertes visibles avec statut d'acquittement (alert_acknowledgments.alert_id).
 * @param {{ sinceMemberRegistration?: boolean }} [options]
 * @returns { ok, alerts: [{ id, message, createdAt, senderName, acknowledged }] }
 */
export async function getVisibleAlertsWithAckStatus(options = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const sinceMemberRegistration = !!options.sinceMemberRegistration;
  try {
    const cutoffPromise = sinceMemberRegistration
      ? resolveMemberAlertCutoff()
      : Promise.resolve({ ok: true, sinceIso: null });

    let visibleRes = await withTimeout(
      supabase
        .from("alerts")
        .select(
          "id, message, title, body, created_at, created_by, sender:profiles!alerts_created_by_fkey(first_name, last_name)"
        )
        .order("created_at", { ascending: false })
        .limit(50),
      SUPABASE_TIMEOUT_MS,
      "قراءة التنبيهات"
    );

    if (
      visibleRes.error &&
      /relationship|PGRST200|Could not find/i.test(visibleRes.error.message || "")
    ) {
      visibleRes = await withTimeout(
        supabase
          .from("alerts")
          .select("id, message, title, body, created_at, created_by")
          .order("created_at", { ascending: false })
          .limit(50),
        SUPABASE_TIMEOUT_MS,
        "قراءة التنبيهات"
      );
    }

    const [acksRes, cutoff] = await Promise.all([
      withTimeout(
        supabase.from("alert_acknowledgments").select("alert_id"),
        SUPABASE_TIMEOUT_MS,
        "قراءة الإقرارات"
      ),
      cutoffPromise,
    ]);

    if (visibleRes.error || acksRes.error) {
      return {
        ok: false,
        error: mapTableError(visibleRes.error || acksRes.error, "alerts"),
      };
    }

    const acked = new Set((acksRes.data || []).map((a) => a.alert_id));
    let alerts = (visibleRes.data || []).map((a) => ({
      id: a.id,
      message: a.message || a.body || a.title || "",
      createdAt: a.created_at,
      senderName: mapSenderName(a),
      acknowledged: acked.has(a.id),
    }));
    if (sinceMemberRegistration) {
      alerts = filterAlertsSince(alerts, cutoff.sinceIso);
    }
    return { ok: true, alerts };
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
