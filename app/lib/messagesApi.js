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
 * Profil admin de référence (chat superviseur <-> admin). RLS :
 * profiles_select_superviseur_admin limite la lecture des profils admin
 * aux comptes superviseur. @returns { ok, admin? }
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
    return { ok: true, admin: data || null };
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
  if (!otherUserId) {
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
        "id, seance_id, sender_id, recipient_id, contenu, image_url, created_at, sender:profiles!messages_sender_id_fkey(first_name, last_name), recipient:profiles!messages_recipient_id_fkey(first_name, last_name)"
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
  if (!recipientId) {
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
 * Abonnement Realtime aux nouveaux messages de la conversation avec
 * otherUserId (INSERT sur messages, filtré par RLS : seuls les messages où
 * l'on est participant remontent ; on filtre ensuite côté client sur le
 * binôme, un utilisateur pouvant avoir plusieurs conversations).
 * @param {object} params { otherUserId }
 * @param {(message) => void} onMessage
 * @returns {() => void} fonction de désabonnement
 */
export function subscribeConversation({ otherUserId }, onMessage) {
  if (!isSupabaseConfigured() || typeof onMessage !== "function") {
    return () => {};
  }
  const channel = supabase.channel(`conversation_${otherUserId}`);

  channel
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const msg = payload?.new;
        if (!msg) return;
        if (msg.sender_id === otherUserId || msg.recipient_id === otherUserId) {
          onMessage(msg);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
