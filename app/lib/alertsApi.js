import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { resolvePublicAvatarUrl } from "./avatarApi";

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

function mapSenderAvatar(row) {
  return row?.sender?.avatar_url || null;
}

function mapSenderInitial(row) {
  const p = row?.sender;
  const name = `${p?.first_name || ""} ${p?.last_name || ""}`.trim();
  return (name || "إ").charAt(0);
}

const ALERTS_SENDER_SELECT =
  "id, message, title, body, audience, created_at, created_by, saison_id, sender:profiles!created_by(first_name, last_name, avatar_url)";

const ALERTS_SENDER_SELECT_FALLBACK =
  "id, message, title, body, audience, created_at, created_by, saison_id";

const ALERTS_SENDER_SELECT_NO_SAISON =
  "id, message, title, body, audience, created_at, created_by, sender:profiles!created_by(first_name, last_name, avatar_url)";

const ALERTS_SENDER_SELECT_NO_SAISON_FALLBACK =
  "id, message, title, body, audience, created_at, created_by";

async function fetchAlertsWithSender(queryBuilder) {
  let res = await withTimeout(queryBuilder(ALERTS_SENDER_SELECT), SUPABASE_TIMEOUT_MS, "قراءة التنبيهات");
  if (
    res.error &&
    /saison_id|column.*does not exist/i.test(res.error.message || "")
  ) {
    res = await withTimeout(
      queryBuilder(ALERTS_SENDER_SELECT_NO_SAISON),
      SUPABASE_TIMEOUT_MS,
      "قراءة التنبيهات"
    );
  }
  if (
    res.error &&
    /relationship|PGRST200|Could not find|avatar_url/i.test(res.error.message || "")
  ) {
    const clause = /saison_id|column.*does not exist/i.test(res.error.message || "")
      ? ALERTS_SENDER_SELECT_NO_SAISON_FALLBACK
      : ALERTS_SENDER_SELECT.replace(", avatar_url", "");
    res = await withTimeout(
      queryBuilder(clause),
      SUPABASE_TIMEOUT_MS,
      "قراءة التنبيهات"
    );
  }
  if (
    res.error &&
    /relationship|PGRST200|Could not find|saison_id/i.test(res.error.message || "")
  ) {
    res = await withTimeout(
      queryBuilder(ALERTS_SENDER_SELECT_NO_SAISON_FALLBACK),
      SUPABASE_TIMEOUT_MS,
      "قراءة التنبيهات"
    );
  }
  return res;
}

function mapAlertRow(a) {
  const senderId = a.created_by || a.sender?.id || null;
  return {
    id: a.id,
    message: a.message || a.body || a.title || "",
    audience: a.audience,
    createdAt: a.created_at,
    saisonId: a.saison_id || null,
    senderId,
    senderName: mapSenderName(a),
    senderAvatarUrl: resolvePublicAvatarUrl(senderId, mapSenderAvatar(a)),
    senderInitial: mapSenderInitial(a),
  };
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
 * Date/heure d'inscription du membre pour UNE saison (notifications + activités).
 * Priorité : inscription acceptée de cette saison → demande activée → null.
 * @returns { ok, sinceIso, saisonId }
 */
export async function resolveMemberSeasonAlertCutoff(authId = null, saisonId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, sinceIso: null, saisonId: saisonId || null };
  }
  const membreId = authId || (await currentAuthId());
  const season = String(saisonId || "").trim() || null;
  if (!membreId || !season) {
    return { ok: true, sinceIso: null, saisonId: season };
  }

  try {
    let inscRes = await withTimeout(
      supabase
        .from("inscriptions")
        .select("date_inscription, created_at, saison_id")
        .eq("membre_id", membreId)
        .eq("saison_id", season)
        .eq("statut", "accepte")
        .order("date_inscription", { ascending: true })
        .limit(1)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة تاريخ التسجيل للموسم"
    );

    if (
      inscRes.error &&
      /date_inscription|column.*does not exist/i.test(inscRes.error.message || "")
    ) {
      inscRes = await withTimeout(
        supabase
          .from("inscriptions")
          .select("created_at, saison_id")
          .eq("membre_id", membreId)
          .eq("saison_id", season)
          .eq("statut", "accepte")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        SUPABASE_TIMEOUT_MS,
        "قراءة تاريخ التسجيل للموسم"
      );
    }

    if (!inscRes.error && inscRes.data) {
      const since =
        inscRes.data.date_inscription || inscRes.data.created_at || null;
      if (since) {
        return { ok: true, sinceIso: since, saisonId: season };
      }
    }

    // Repli : demande d'inscription / renouvellement activée pour cette saison
    const { data: appRow } = await withTimeout(
      supabase
        .from("member_applications")
        .select("activated_at, accepted_at, created_at, season_id, status")
        .eq("user_id", membreId)
        .eq("season_id", season)
        .in("status", ["activated", "invited"])
        .order("activated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة طلب التسجيل للموسم"
    );
    if (appRow) {
      const since =
        appRow.activated_at || appRow.accepted_at || appRow.created_at || null;
      if (since) {
        return { ok: true, sinceIso: since, saisonId: season };
      }
    }

    return { ok: true, sinceIso: null, saisonId: season };
  } catch (e) {
    return { ok: false, sinceIso: null, saisonId: season, error: e?.message };
  }
}

/**
 * Date d'activation / affectation du superviseur pour UNE saison.
 * Priorité : invitation activated (updated_at) → séance active de la saison.
 */
export async function resolveSupervisorSeasonAlertCutoff(
  authId = null,
  saisonId = null
) {
  if (!isSupabaseConfigured()) {
    return { ok: false, sinceIso: null, saisonId: saisonId || null };
  }
  const supervisorId = authId || (await currentAuthId());
  const season = String(saisonId || "").trim() || null;
  if (!supervisorId || !season) {
    return { ok: true, sinceIso: null, saisonId: season };
  }

  try {
    const { data: profile } = await withTimeout(
      supabase
        .from("profiles")
        .select("email, canonical_email")
        .eq("id", supervisorId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة ملف المشرف"
    );
    const mail = String(
      profile?.canonical_email || profile?.email || ""
    )
      .trim()
      .toLowerCase();

    if (mail) {
      const { data: inv } = await withTimeout(
        supabase
          .from("supervisor_invitations")
          .select("updated_at, created_at, status, saison_id")
          .ilike("email", mail)
          .eq("saison_id", season)
          .eq("status", "activated")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        SUPABASE_TIMEOUT_MS,
        "قراءة دعوة المشرف للموسم"
      );
      if (inv) {
        const since = inv.updated_at || inv.created_at || null;
        if (since) {
          return { ok: true, sinceIso: since, saisonId: season };
        }
      }
    }

    const { data: seance } = await withTimeout(
      supabase
        .from("seances")
        .select("created_at, updated_at, saison_id")
        .eq("superviseur_id", supervisorId)
        .eq("saison_id", season)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة حصة المشرف للموسم"
    );
    if (seance) {
      const since = seance.created_at || seance.updated_at || null;
      if (since) {
        return { ok: true, sinceIso: since, saisonId: season };
      }
    }

    return { ok: true, sinceIso: null, saisonId: season };
  } catch (e) {
    return { ok: false, sinceIso: null, saisonId: season, error: e?.message };
  }
}

/**
 * Cutoff global (compat) : première inscription acceptée toutes saisons.
 * Préférer resolveMemberSeasonAlertCutoff pour le produit saisonnier.
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
 * Filtre saison + date d'inscription :
 * 1) même saison (les alertes sans saison_id sont exclues si saisonId fourni)
 * 2) created_at >= sinceIso
 * Si pas encore inscrit (sinceIso null) → liste vide.
 */
function filterAlertsForSeasonScope(alerts, { saisonId = null, sinceIso = null } = {}) {
  const season = String(saisonId || "").trim() || null;
  if (season && !sinceIso) {
    return [];
  }
  let list = alerts || [];
  if (season) {
    list = list.filter((a) => {
      const aSeason = a.saisonId || a.saison_id || null;
      return aSeason === season;
    });
  }
  return filterAlertsSince(list, sinceIso);
}

async function resolveScopedCutoff(options = {}) {
  const saisonId = String(options.saisonId || "").trim() || null;
  const scopeToCurrentSeason = !!options.scopeToCurrentSeason || !!saisonId;
  const role = options.role || "member";

  if (!scopeToCurrentSeason) {
    if (options.sinceMemberRegistration) {
      return resolveMemberAlertCutoff(options.authId || null);
    }
    return { ok: true, sinceIso: null, saisonId: null };
  }

  if (role === "supervisor") {
    return resolveSupervisorSeasonAlertCutoff(options.authId || null, saisonId);
  }
  return resolveMemberSeasonAlertCutoff(options.authId || null, saisonId);
}

/**
 * Alertes non encore acquittées (FIFO). Filtrage optionnel saison + date d'inscription.
 * @param {{
 *   sinceMemberRegistration?: boolean,
 *   scopeToCurrentSeason?: boolean,
 *   saisonId?: string|null,
 *   role?: 'member'|'supervisor',
 *   authId?: string|null,
 * }} [options]
 */
export async function getUnacknowledgedAlerts(options = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const saisonId = String(options.saisonId || "").trim() || null;
    const scoped =
      !!options.scopeToCurrentSeason ||
      !!saisonId ||
      !!options.sinceMemberRegistration;

    const [alertsRes, acksRes, cutoff] = await Promise.all([
      fetchAlertsWithSender((selectClause) =>
        supabase.from("alerts").select(selectClause).order("created_at", { ascending: true })
      ),
      withTimeout(
        supabase.from("alert_acknowledgments").select("alert_id"),
        SUPABASE_TIMEOUT_MS,
        "قراءة الإقرارات"
      ),
      scoped
        ? resolveScopedCutoff(options)
        : Promise.resolve({ ok: true, sinceIso: null, saisonId: null }),
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
      .map(mapAlertRow);

    if (scoped) {
      pending = filterAlertsForSeasonScope(pending, {
        saisonId: cutoff.saisonId || saisonId,
        sinceIso: cutoff.sinceIso,
      });
    }

    return { ok: true, alerts: pending, sinceIso: cutoff.sinceIso || null };
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
 * (Admin) Émission d'une alerte.
 * @param {string} message
 * @param {"all"|"members"|"supervisors"} audience
 * @param {{ saisonId?: string|null }} [options]
 */
export async function sendAlert(message, audience, options = {}) {
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
  const saisonId = String(options.saisonId || "").trim() || null;
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
      saison_id: saisonId,
    };

    let insertError = (
      await withTimeout(
        supabase.from("alerts").insert(row),
        SUPABASE_TIMEOUT_MS,
        "إرسال التنبيه"
      )
    ).error;

    if (insertError && /saison_id|column.*does not exist/i.test(insertError.message || "")) {
      const { saison_id: _s, ...withoutSeason } = row;
      insertError = (
        await withTimeout(
          supabase.from("alerts").insert(withoutSeason),
          SUPABASE_TIMEOUT_MS,
          "إرسال التنبيه"
        )
      ).error;
    }

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

    const rpcArgs = saisonId
      ? { p_message: text, p_audience: target, p_saison_id: saisonId }
      : { p_message: text, p_audience: target };
    const { error: rpcError } = await withTimeout(
      supabase.rpc("send_alert", rpcArgs),
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
 * (Admin) Historique des alertes. Filtre saison optionnel (null = toutes).
 * @param {{ saisonId?: string|null }} [options]
 */
export async function getAllAlertsAdmin(options = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const saisonId = String(options.saisonId || "").trim() || null;
  try {
    let query = supabase
      .from("alerts")
      .select("id, message, title, body, audience, created_at, saison_id")
      .order("created_at", { ascending: false });
    if (saisonId) {
      query = query.eq("saison_id", saisonId);
    }
    let { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "قراءة سجل التنبيهات"
    );

    if (error && /saison_id|column.*does not exist/i.test(error.message || "")) {
      ({ data, error } = await withTimeout(
        supabase
          .from("alerts")
          .select("id, message, title, body, audience, created_at")
          .order("created_at", { ascending: false }),
        SUPABASE_TIMEOUT_MS,
        "قراءة سجل التنبيهات"
      ));
    }

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
          saisonId: a.saison_id || null,
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
 * Alertes visibles (RLS + saison + date d'inscription).
 */
export async function getVisibleAlerts(options = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 20;
  const saisonId = String(options.saisonId || "").trim() || null;
  const scoped =
    !!options.scopeToCurrentSeason ||
    !!saisonId ||
    !!options.sinceMemberRegistration;
  try {
    const [result, cutoff] = await Promise.all([
      fetchAlertsWithSender((selectClause) =>
        supabase
          .from("alerts")
          .select(selectClause)
          .order("created_at", { ascending: false })
          .limit(Math.max(limit, 80))
      ),
      scoped
        ? resolveScopedCutoff(options)
        : Promise.resolve({ ok: true, sinceIso: null, saisonId: null }),
    ]);

    const { data, error } = result;
    if (error) {
      return { ok: false, error: mapTableError(error, "alerts") };
    }
    let alerts = (data || []).map(mapAlertRow);
    if (scoped) {
      alerts = filterAlertsForSeasonScope(alerts, {
        saisonId: cutoff.saisonId || saisonId,
        sinceIso: cutoff.sinceIso,
      });
    }
    return {
      ok: true,
      alerts: alerts.slice(0, limit),
      sinceIso: cutoff.sinceIso || null,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Alertes visibles avec statut d'acquittement.
 */
export async function getVisibleAlertsWithAckStatus(options = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const saisonId = String(options.saisonId || "").trim() || null;
  const scoped =
    !!options.scopeToCurrentSeason ||
    !!saisonId ||
    !!options.sinceMemberRegistration;
  try {
    const [visibleRes, acksRes, cutoff] = await Promise.all([
      fetchAlertsWithSender((selectClause) =>
        supabase
          .from("alerts")
          .select(selectClause)
          .order("created_at", { ascending: false })
          .limit(80)
      ),
      withTimeout(
        supabase.from("alert_acknowledgments").select("alert_id"),
        SUPABASE_TIMEOUT_MS,
        "قراءة الإقرارات"
      ),
      scoped
        ? resolveScopedCutoff(options)
        : Promise.resolve({ ok: true, sinceIso: null, saisonId: null }),
    ]);

    if (visibleRes.error || acksRes.error) {
      return {
        ok: false,
        error: mapTableError(visibleRes.error || acksRes.error, "alerts"),
      };
    }

    const acked = new Set((acksRes.data || []).map((a) => a.alert_id));
    let alerts = (visibleRes.data || []).map((a) => ({
      ...mapAlertRow(a),
      acknowledged: acked.has(a.id),
    }));
    if (scoped) {
      alerts = filterAlertsForSeasonScope(alerts, {
        saisonId: cutoff.saisonId || saisonId,
        sinceIso: cutoff.sinceIso,
      });
    }
    return { ok: true, alerts, sinceIso: cutoff.sinceIso || null };
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
