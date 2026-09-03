import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

const SUPABASE_TIMEOUT_MS = 15000;

/** UUID v4 de profile — tout autre valeur (ex. "admin") est refusée. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function newUuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

/** Traduit une erreur de table Supabase (table absente / RLS / doublon / autre). */
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

/** Id du membre connecté via la session Supabase, ou null. */
async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/**
 * Séance active du membre connecté (inscription 'accepte'), avec le profil
 * du superviseur joint. RLS (seances_select_member_inscrit) limite déjà la
 * réponse à sa séance. @returns { ok, seance? }
 */
export async function getMySeance() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("seances")
        .select(
          "id, nom, saison_id, jour, heure_debut, heure_fin, superviseur_id, superviseur:profiles!seances_superviseur_id_fkey(id, first_name, last_name, email)"
        )
        .limit(1)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة الحصة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "seances") };
    }
    return { ok: true, seance: data || null };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Date d'inscription du membre connecté (self-view).
 * @param {string} [authId] UUID profiles.id — sinon session auth courante
 * @returns {{ ok: boolean, dateInscription?: string|null, error?: string }}
 */
export async function getMyInscriptionDate(authId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", dateInscription: null };
  }
  const membreId = authId || (await currentAuthId());
  if (!membreId) {
    return { ok: false, error: "يجب تسجيل الدخول", dateInscription: null };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("inscriptions")
        .select("date_inscription")
        .eq("membre_id", membreId)
        .eq("statut", "accepte")
        .order("date_inscription", { ascending: false })
        .limit(1)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة تاريخ التسجيل"
    );
    if (error) {
      return {
        ok: false,
        error: mapTableError(error, "inscriptions"),
        dateInscription: null,
      };
    }
    const raw = data?.date_inscription || null;
    return {
      ok: true,
      dateInscription: raw ? String(raw).slice(0, 10) : null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      dateInscription: null,
    };
  }
}

/**
 * Profil admin de référence (chat superviseur <-> admin). RLS :
 * profiles_select_superviseur_admin limite la lecture des profils admin
 * aux comptes superviseur.
 *
 * Choix si plusieurs profils ont role='admin' : on retourne le PREMIER
 * créé (order created_at ASC, limit 1) — choix déterministe, le compte
 * admin racine étant normalement le plus ancien. Aucun admin trouvé =>
 * erreur explicite { ok:false, error }.
 * @returns { ok, admin? }
 */
export async function resolveAdminProfile() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("role", "admin")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة حساب الإدارة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "profiles") };
    }
    if (!data) {
      return { ok: false, error: "لم يتم العثور على حساب الإدارة" };
    }
    return { ok: true, admin: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Tous les profils admin (inbox superviseur, section épinglée).
 * RLS : profiles_select_superviseur_admin.
 * @returns { ok, admins }
 */
export async function listAdminProfiles() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("role", "admin")
        .order("created_at", { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      "قراءة حسابات الإدارة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "profiles") };
    }
    return { ok: true, admins: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Historique d'une conversation entre le membre connecté et otherUserId
 * (les deux sens), trié par date. RG6 est appliqué côté serveur (RLS) :
 * seuls les messages dont on est expéditeur/destinataire remontent.
 * @param {object} params { otherUserId, seanceId? }
 * @returns { ok, messages }
 */
export async function getConversation({ otherUserId, seanceId = null }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!otherUserId || typeof otherUserId !== "string" || !UUID_RE.test(otherUserId)) {
    return { ok: false, error: "المحادثة غير محددة" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    let query = supabase
      .from("messages")
      .select(
        "id, seance_id, sender_id, recipient_id, contenu, image_url, created_at, read_at, sender:profiles!messages_sender_id_fkey(first_name, last_name), recipient:profiles!messages_recipient_id_fkey(first_name, last_name)"
      )
      .or(
        `and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`
      )
      .order("created_at", { ascending: true })
      .limit(200);
    if (seanceId) {
      query = query.eq("seance_id", seanceId);
    }

    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "قراءة المحادثة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "messages") };
    }
    return { ok: true, messages: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Marque comme lus les messages reçus de otherUserId (read_at = maintenant).
 * Ne touche jamais aux messages dont l'utilisateur est l'expéditeur.
 * Policy RLS messages_update_read : scopée sur to_user_id (colonne legacy
 * remplie par le trigger messages_sync_legacy_columns). Ne pas modifier
 * cette policy.
 * @param {object} params { otherUserId, seanceId? }
 * @returns { ok, error? }
 */
export async function markConversationRead({ otherUserId, seanceId = null }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!otherUserId || typeof otherUserId !== "string" || !UUID_RE.test(otherUserId)) {
    return { ok: false, error: "المحادثة غير محددة" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    let query = supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .eq("sender_id", otherUserId)
      .is("read_at", null);
    if (seanceId) {
      query = query.eq("seance_id", seanceId);
    }

    const { error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "تحديث حالة القراءة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "messages") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Envoi d'un message. RG6 est validé côté serveur par la policy
 * messages_insert_authorized (paire autorisée + sender = soi).
 * @param {object} payload { recipientId, seanceId?, contenu, imageUrl? }
 * @returns { ok, message? }
 */
export async function sendMessage({ recipientId, seanceId = null, contenu, imageUrl = null }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const text = String(contenu || "").trim();
  if (!recipientId || typeof recipientId !== "string" || !UUID_RE.test(recipientId)) {
    return { ok: false, error: "المستلم غير محدد" };
  }
  if (!text) {
    return { ok: false, error: "اكتب نص الرسالة" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const row = {
    id: newUuid(),
    sender_id: userId,
    recipient_id: recipientId,
    seance_id: seanceId || null,
    contenu: text,
    image_url: imageUrl || null,
  };

  try {
    const { data, error } = await withTimeout(
      supabase.from("messages").insert(row).select("*").single(),
      SUPABASE_TIMEOUT_MS,
      "إرسال الرسالة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "messages") };
    }
    return { ok: true, message: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Diffusion superviseur : même contenu envoyé en N messages 1-à-1 (RG6).
 * Chaque insert passe par sendMessage → policy messages_insert_authorized.
 *
 * @param {object} params { memberIds, seanceId, contenu }
 * @returns {{ ok, sentCount, failedCount, total, failures?, error? }}
 */
export async function sendBroadcastToMembers({ memberIds, seanceId, contenu }) {
  const text = String(contenu || "").trim();
  if (!text) {
    return { ok: false, error: "اكتب نص الرسالة" };
  }
  if (!seanceId || !UUID_RE.test(seanceId)) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }

  const ids = [...new Set((memberIds || []).filter((id) => UUID_RE.test(id)))];
  if (ids.length === 0) {
    return { ok: false, error: "لا يوجد أعضاء للإرسال" };
  }

  const failures = [];
  let sentCount = 0;

  // Envoi séquentiel : évite la saturation PostgREST et permet un comptage précis.
  for (const memberId of ids) {
    const res = await sendMessage({
      recipientId: memberId,
      seanceId,
      contenu: text,
    });
    if (res.ok) {
      sentCount += 1;
    } else {
      const errMsg = res.error || "فشل غير معروف";
      failures.push({ memberId, error: errMsg });
      console.warn(
        `[messagesApi] sendBroadcastToMembers — échec membre ${memberId}:`,
        errMsg
      );
    }
  }

  const total = ids.length;
  const failedCount = failures.length;

  if (sentCount === 0) {
    return {
      ok: false,
      error: "تعذر الإرسال إلى جميع الأعضاء",
      sentCount: 0,
      failedCount,
      total,
      failures,
    };
  }

  return {
    ok: true,
    sentCount,
    failedCount,
    total,
    failures: failedCount > 0 ? failures : undefined,
  };
}

/**
 * Abonnement Realtime aux nouveaux messages de la conversation avec
 * otherUserId (INSERT sur messages, filtré par RLS : seuls les messages où
 * l'on est participant remontent ; on filtre ensuite côté client sur le
 * binôme, un utilisateur pouvant avoir plusieurs conversations).
 * @param {object} params { otherUserId, myUserId? }
 * @param {(message) => void} onMessage
 * @returns {() => void} fonction de désabonnement
 */
export function subscribeConversation({ otherUserId, myUserId }, onMessage) {
  if (!isSupabaseConfigured() || typeof onMessage !== "function") {
    return () => {};
  }
  const channel = supabase.channel(
    `conversation_${otherUserId}_${myUserId || "me"}`
  );

  channel
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload?.new;
        if (!msg) return;
        const involvesOther =
          msg.sender_id === otherUserId || msg.recipient_id === otherUserId;
        const involvesMe =
          !myUserId ||
          msg.sender_id === myUserId ||
          msg.recipient_id === myUserId;
        if (involvesOther && involvesMe) onMessage(msg);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

function otherParty(message, myUserId) {
  if (message.sender_id === myUserId) {
    return {
      id: message.recipient_id,
      profile: message.recipient || null,
      incoming: false,
    };
  }
  return {
    id: message.sender_id,
    profile: message.sender || null,
    incoming: true,
  };
}

/**
 * Dernier message de chaque conversation du compte connecté, plus récent
 * d'abord. Sert aux boîtes de réception (admin, superviseur, membre).
 * @returns { ok, threads }
 */
export async function getInboxThreads() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("messages")
        .select(
          "id, seance_id, sender_id, recipient_id, contenu, created_at, read_at, sender:profiles!messages_sender_id_fkey(id, first_name, last_name, email, role), recipient:profiles!messages_recipient_id_fkey(id, first_name, last_name, email, role)"
        )
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(300),
      SUPABASE_TIMEOUT_MS,
      "قراءة صندوق الرسائل"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "messages") };
    }

    const threads = [];
    const seen = new Set();
    const unreadCountByOther = new Map();
    for (const m of data || []) {
      const other = otherParty(m, userId);
      if (!other.id) continue;
      if (m.recipient_id === userId && !m.read_at) {
        unreadCountByOther.set(
          other.id,
          (unreadCountByOther.get(other.id) || 0) + 1
        );
      }
      if (seen.has(other.id)) continue;
      seen.add(other.id);
      const p = other.profile || {};
      threads.push({
        otherId: other.id,
        firstName: p.first_name || "",
        lastName: p.last_name || "",
        email: p.email || "",
        role: p.role || "",
        lastMessage: m.contenu || "",
        lastAt: m.created_at,
        incoming: other.incoming,
        seanceId: m.seance_id || null,
        unread: false,
        unreadCount: 0,
      });
    }
    for (const t of threads) {
      const n = unreadCountByOther.get(t.otherId) || 0;
      t.unreadCount = n;
      t.unread = n > 0;
    }
    return { ok: true, threads };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Abonnement Realtime à tous les nouveaux messages du compte (inbox).
 * RLS ne laisse passer que les lignes où l'on est expéditeur/destinataire.
 * @param {(message) => void} onMessage
 * @returns {() => void}
 */
export function subscribeMyMessages(onMessage) {
  if (!isSupabaseConfigured() || typeof onMessage !== "function") {
    return () => {};
  }
  const channel = supabase.channel(`inbox_${Date.now()}`);

  channel
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload?.new;
        if (msg) onMessage(msg);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Fusionne une liste de contacts avec les derniers messages (inbox).
 * Les conversations récentes passent en tête pour répondre tout de suite.
 * unread : au moins un message entrant avec read_at null (calculé dans getInboxThreads).
 * @param {object} [options]
 * @param {boolean} [options.appendUnknown=true] hors-contacts (autres threads)
 */
export function mergeInboxRows(contacts, threads, options = {}) {
  const appendUnknown = options.appendUnknown !== false;
  const byId = new Map((threads || []).map((t) => [t.otherId, t]));
  const rows = (contacts || []).map((c) => {
    const t = byId.get(c.id);
    const lastAt = t?.lastAt || null;
    return {
      id: c.id,
      name: c.name,
      role: c.role || t?.role || "",
      avatarLetter: c.avatarLetter,
      avatarPrimary: !!c.avatarPrimary,
      highlighted: !!c.highlighted,
      lastMessage: t?.lastMessage || "لا توجد رسائل بعد",
      lastAt,
      time: formatRelativeTime(lastAt),
      unread: !!t?.unread,
      unreadCount: t?.unreadCount || 0,
    };
  });

  if (appendUnknown) {
    for (const t of threads || []) {
      if (rows.some((r) => r.id === t.otherId)) continue;
      const name =
        `${t.firstName || ""} ${t.lastName || ""}`.trim() || t.email || "—";
      rows.push({
        id: t.otherId,
        name,
        role: t.role || "",
        avatarLetter: (t.firstName || name).trim().charAt(0) || "؟",
        avatarPrimary: t.role === "admin",
        highlighted: t.role === "admin",
        lastMessage: t.lastMessage || "لا توجد رسائل بعد",
        lastAt: t.lastAt,
        time: formatRelativeTime(t.lastAt),
        unread: !!t.unread,
        unreadCount: t.unreadCount || 0,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return (a.name || "").localeCompare(b.name || "", "ar");
  });
  return rows;
}

/** Libellé latin du badge non lu : vide, "1"…"9", ou "9+". */
export function formatUnreadBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  if (n > 9) return "9+";
  return String(n);
}

/** Horodatage relatif arabe pour la liste des conversations. */
export function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "أمس";
  if (days < 7) return `منذ ${days} أيام`;
  return d.toLocaleDateString("ar");
}
