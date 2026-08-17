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
          .select("id, message, created_at")
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
        message: a.message,
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
  try {
    const { error } = await withTimeout(
      supabase.rpc("send_alert", { p_message: message, p_audience: audience }),
      SUPABASE_TIMEOUT_MS,
      "إرسال التنبيه"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "alerts") };
    }
    return { ok: true };
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
        .select("id, message, audience, created_at"),
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
          message: a.message,
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

/** Id de l'utilisateur connecté via la session Supabase, ou null. */
async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}