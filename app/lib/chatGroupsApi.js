import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { resolvePublicAvatarUrl } from "./avatarApi";
import { formatRelativeTime } from "./messagesApi";

const SUPABASE_TIMEOUT_MS = 15000;
const GROUP_AVATAR_BUCKET = "chat-group-avatars";

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

function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/0054 في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/duplicate key|23505/i.test(msg)) {
    return "سجل مكرر — هذه العملية مسجلة مسبقاً";
  }
  return mapSupabaseAuthError(error);
}

function mapStorageError(error) {
  const msg = error?.message || "";
  if (/permission|row-level security|RLS|42501|violates row|not allowed/i.test(msg)) {
    return "لا صلاحية كافية لرفع هذه الصورة";
  }
  if (/payload too large|413|file_size_limit/i.test(msg)) {
    return "الصورة كبيرة جداً (الحد الأقصى 2 ميغابايت)";
  }
  if (/invalid mime|mime type/i.test(msg)) {
    return "نوع الصورة غير مدعوم — استخدم JPEG أو PNG";
  }
  if (/bucket.*not found|Bucket not found/i.test(msg)) {
    return "مساحة التخزين غير مهيأة — نفّذ migration 0055 في Supabase";
  }
  return mapSupabaseAuthError(error) || "تعذر رفع الصورة";
}

async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

function groupAvatarObjectPath(groupId) {
  return `${groupId}.jpg`;
}

function buildPublicGroupAvatarUrl(groupId, cacheBust = Date.now()) {
  const { data } = supabase.storage
    .from(GROUP_AVATAR_BUCKET)
    .getPublicUrl(groupAvatarObjectPath(groupId));
  const base = data?.publicUrl || "";
  if (!base) return null;
  return `${base}?v=${cacheBust}`;
}

/**
 * URL publique de l'icône du groupe.
 * Priorité au chemin conventionnel chat-group-avatars/{groupId}.jpg.
 */
export function resolvePublicGroupAvatarUrl(groupId, storedUrl = null) {
  if (groupId && UUID_RE.test(groupId)) {
    let cacheBust = 1;
    const stored = storedUrl ? String(storedUrl) : "";
    const match = stored.match(/[?&]v=(\d+)/);
    if (match) cacheBust = match[1];
    if (
      /^https?:\/\//i.test(stored) &&
      stored.includes(`/chat-group-avatars/${groupId}`)
    ) {
      return stored;
    }
    // Pas d'URL stockée : ne pas inventer une URL (l'image n'existe peut-être pas).
    if (!stored) return null;
    return buildPublicGroupAvatarUrl(groupId, cacheBust);
  }
  if (storedUrl) return String(storedUrl);
  return null;
}

/**
 * Crée / synchronise le groupe de la séance (RPC security definer).
 * @returns {{ ok, groupId? }}
 */
export async function ensureSeanceChatGroup(seanceId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId || !UUID_RE.test(seanceId)) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc("ensure_seance_chat_group", { p_seance_id: seanceId }),
      SUPABASE_TIMEOUT_MS,
      "إنشاء مجموعة الحصة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "chat_groups") };
    }
    return { ok: true, groupId: data || null };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Groupes du compte connecté + dernier message + non lus.
 * @returns {{ ok, groups }}
 */
export async function getMyChatGroups() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", groups: [] };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول", groups: [] };
  }

  try {
    const { data: memberships, error: memError } = await withTimeout(
      supabase
        .from("chat_group_members")
        .select(
          `role, group:chat_groups!chat_group_members_group_id_fkey(id, seance_id, nom, avatar_url, created_at)`
        )
        .eq("membre_id", userId),
      SUPABASE_TIMEOUT_MS,
      "قراءة مجموعات الرسائل"
    );
    if (memError) {
      return {
        ok: false,
        error: mapTableError(memError, "chat_group_members"),
        groups: [],
      };
    }

    const groupsAll = (memberships || [])
      .map((row) => {
        const g = row.group;
        if (!g?.id) return null;
        return {
          id: g.id,
          seanceId: g.seance_id,
          name: g.nom || "مجموعة الحصة",
          avatarUrl: resolvePublicGroupAvatarUrl(g.id, g.avatar_url),
          myRole: row.role || "member",
          isAdmin: row.role === "admin",
        };
      })
      .filter(Boolean);

    if (groupsAll.length === 0) {
      return { ok: true, groups: [] };
    }

    // Inbox : uniquement les séances encore ouvertes (`seances.statut`).
    // Pas de filtre `saisons.active` ici — voir le rapport (archivage parfois incomplet).
    const seanceIds = [
      ...new Set(groupsAll.map((g) => g.seanceId).filter(Boolean)),
    ];
    let groupsRaw = [];
    if (seanceIds.length > 0) {
      const { data: activeSeances, error: seanceError } = await withTimeout(
        supabase
          .from("seances")
          .select("id")
          .in("id", seanceIds)
          .eq("statut", "active"),
        SUPABASE_TIMEOUT_MS,
        "قراءة حصص المجموعات"
      );
      if (seanceError) {
        return {
          ok: false,
          error: mapTableError(seanceError, "seances"),
          groups: [],
        };
      }
      const activeIds = new Set((activeSeances || []).map((s) => s.id));
      groupsRaw = groupsAll.filter((g) => activeIds.has(g.seanceId));
    }

    if (groupsRaw.length === 0) {
      return { ok: true, groups: [] };
    }

    const groupIds = groupsRaw.map((g) => g.id);

    // Derniers messages (limit large, groupés côté client)
    const { data: messages, error: msgError } = await withTimeout(
      supabase
        .from("chat_group_messages")
        .select(
          "id, group_id, sender_id, contenu, created_at, sender:profiles!chat_group_messages_sender_id_fkey(first_name, last_name)"
        )
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
        .limit(300),
      SUPABASE_TIMEOUT_MS,
      "قراءة رسائل المجموعات"
    );
    if (msgError) {
      return {
        ok: false,
        error: mapTableError(msgError, "chat_group_messages"),
        groups: [],
      };
    }

    const { data: reads } = await withTimeout(
      supabase
        .from("chat_group_reads")
        .select("group_id, last_read_at")
        .eq("user_id", userId)
        .in("group_id", groupIds),
      SUPABASE_TIMEOUT_MS,
      "قراءة حالة المجموعات"
    );

    const lastReadByGroup = new Map(
      (reads || []).map((r) => [r.group_id, r.last_read_at])
    );
    const lastMsgByGroup = new Map();
    const unreadByGroup = new Map();

    for (const m of messages || []) {
      if (!lastMsgByGroup.has(m.group_id)) {
        lastMsgByGroup.set(m.group_id, m);
      }
      const lastRead = lastReadByGroup.get(m.group_id);
      const isUnread =
        m.sender_id !== userId &&
        (!lastRead || new Date(m.created_at) > new Date(lastRead));
      if (isUnread) {
        unreadByGroup.set(
          m.group_id,
          (unreadByGroup.get(m.group_id) || 0) + 1
        );
      }
    }

    const groups = groupsRaw.map((g) => {
      const last = lastMsgByGroup.get(g.id);
      const sender = last?.sender || {};
      const senderName =
        `${sender.first_name || ""} ${sender.last_name || ""}`.trim();
      let preview = "لا توجد رسائل بعد";
      if (last?.contenu) {
        preview =
          last.sender_id === userId
            ? `أنت: ${last.contenu}`
            : senderName
              ? `${senderName}: ${last.contenu}`
              : last.contenu;
      }
      const unreadCount = unreadByGroup.get(g.id) || 0;
      return {
        ...g,
        lastMessage: preview,
        lastAt: last?.created_at || null,
        time: formatRelativeTime(last?.created_at || null),
        unreadCount,
        unread: unreadCount > 0,
      };
    });

    groups.sort((a, b) => {
      if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? 1 : -1;
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return (a.name || "").localeCompare(b.name || "", "ar");
    });

    return { ok: true, groups };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      groups: [],
    };
  }
}

/**
 * Historique d'un groupe (limite 200).
 */
export async function getGroupMessages(groupId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", messages: [] };
  }
  if (!groupId || !UUID_RE.test(groupId)) {
    return { ok: false, error: "المجموعة غير محددة", messages: [] };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("chat_group_messages")
        .select(
          "id, group_id, sender_id, contenu, image_url, created_at, sender:profiles!chat_group_messages_sender_id_fkey(id, first_name, last_name, avatar_url)"
        )
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(200),
      SUPABASE_TIMEOUT_MS,
      "قراءة محادثة المجموعة"
    );
    if (error) {
      return {
        ok: false,
        error: mapTableError(error, "chat_group_messages"),
        messages: [],
      };
    }
    return { ok: true, messages: data || [] };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      messages: [],
    };
  }
}

/**
 * Envoi d'un message de groupe.
 */
export async function sendGroupMessage({ groupId, contenu, imageUrl = null }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const text = String(contenu || "").trim();
  if (!groupId || !UUID_RE.test(groupId)) {
    return { ok: false, error: "المجموعة غير محددة" };
  }
  if (!text && !imageUrl) {
    return { ok: false, error: "اكتب نص الرسالة" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const row = {
    id: newUuid(),
    group_id: groupId,
    sender_id: userId,
    contenu: text || null,
    image_url: imageUrl || null,
  };

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("chat_group_messages")
        .insert(row)
        .select(
          "id, group_id, sender_id, contenu, image_url, created_at, sender:profiles!chat_group_messages_sender_id_fkey(id, first_name, last_name, avatar_url)"
        )
        .single(),
      SUPABASE_TIMEOUT_MS,
      "إرسال رسالة المجموعة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "chat_group_messages") };
    }
    return { ok: true, message: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Marque le groupe comme lu jusqu'à maintenant.
 */
export async function markGroupRead(groupId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!groupId || !UUID_RE.test(groupId)) {
    return { ok: false, error: "المجموعة غير محددة" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    const now = new Date().toISOString();
    const { error } = await withTimeout(
      supabase.from("chat_group_reads").upsert(
        {
          group_id: groupId,
          user_id: userId,
          last_read_at: now,
        },
        { onConflict: "group_id,user_id" }
      ),
      SUPABASE_TIMEOUT_MS,
      "تحديث حالة القراءة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "chat_group_reads") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Abonnement Realtime aux nouveaux messages d'un groupe.
 * @returns {() => void}
 */
export function subscribeGroupMessages(groupId, onMessage) {
  if (
    !isSupabaseConfigured() ||
    typeof onMessage !== "function" ||
    !groupId ||
    !UUID_RE.test(groupId)
  ) {
    return () => {};
  }
  const channel = supabase.channel(`group_chat_${groupId}`);

  channel
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_group_messages",
        filter: `group_id=eq.${groupId}`,
      },
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
 * Abonnement Realtime à tous les nouveaux messages de groupes (inbox).
 * @returns {() => void}
 */
export function subscribeMyGroupMessages(onMessage) {
  if (!isSupabaseConfigured() || typeof onMessage !== "function") {
    return () => {};
  }
  const channel = supabase.channel(`group_inbox_${Date.now()}`);

  channel
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_group_messages" },
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
 * Membres du groupe avec profils.
 */
export async function getGroupMembers(groupId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", members: [] };
  }
  if (!groupId || !UUID_RE.test(groupId)) {
    return { ok: false, error: "المجموعة غير محددة", members: [] };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("chat_group_members")
        .select(
          `role, added_at, membre:profiles!chat_group_members_membre_id_fkey(id, first_name, last_name, email, avatar_url, role)`
        )
        .eq("group_id", groupId)
        .order("added_at", { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      "قراءة أعضاء المجموعة"
    );
    if (error) {
      return {
        ok: false,
        error: mapTableError(error, "chat_group_members"),
        members: [],
      };
    }

    const members = (data || [])
      .map((row) => {
        const p = row.membre;
        if (!p?.id) return null;
        const name =
          `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
          p.email ||
          "—";
        return {
          id: p.id,
          name,
          firstName: p.first_name || "",
          lastName: p.last_name || "",
          email: p.email || "",
          avatarUrl: resolvePublicAvatarUrl(p.id, p.avatar_url),
          groupRole: row.role || "member",
          profileRole: p.role || "",
          isAdmin: row.role === "admin",
        };
      })
      .filter(Boolean);

    // Admin en tête
    members.sort((a, b) => {
      if (a.isAdmin && !b.isAdmin) return -1;
      if (!a.isAdmin && b.isAdmin) return 1;
      return (a.name || "").localeCompare(b.name || "", "ar");
    });

    return { ok: true, members };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      members: [],
    };
  }
}

/**
 * Inscrits acceptés de la séance absents du groupe (pour ajout manuel).
 */
export async function getEligibleMembers(groupId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", members: [] };
  }
  if (!groupId || !UUID_RE.test(groupId)) {
    return { ok: false, error: "المجموعة غير محددة", members: [] };
  }

  try {
    const { data: group, error: gError } = await withTimeout(
      supabase
        .from("chat_groups")
        .select("id, seance_id")
        .eq("id", groupId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة المجموعة"
    );
    if (gError) {
      return {
        ok: false,
        error: mapTableError(gError, "chat_groups"),
        members: [],
      };
    }
    if (!group?.seance_id) {
      return { ok: false, error: "المجموعة غير موجودة", members: [] };
    }

    const { data: current, error: cError } = await withTimeout(
      supabase
        .from("chat_group_members")
        .select("membre_id")
        .eq("group_id", groupId),
      SUPABASE_TIMEOUT_MS,
      "قراءة أعضاء المجموعة"
    );
    if (cError) {
      return {
        ok: false,
        error: mapTableError(cError, "chat_group_members"),
        members: [],
      };
    }
    const inGroup = new Set((current || []).map((r) => r.membre_id));

    const { data: inscriptions, error: iError } = await withTimeout(
      supabase
        .from("inscriptions")
        .select(
          `membre_id, membre:profiles!inscriptions_membre_id_fkey(id, first_name, last_name, email, avatar_url)`
        )
        .eq("seance_id", group.seance_id)
        .eq("statut", "accepte"),
      SUPABASE_TIMEOUT_MS,
      "قراءة أعضاء الحصة"
    );
    if (iError) {
      return {
        ok: false,
        error: mapTableError(iError, "inscriptions"),
        members: [],
      };
    }

    const members = (inscriptions || [])
      .map((row) => {
        const p = row.membre;
        if (!p?.id || inGroup.has(p.id)) return null;
        const name =
          `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
          p.email ||
          "—";
        return {
          id: p.id,
          name,
          firstName: p.first_name || "",
          lastName: p.last_name || "",
          avatarUrl: resolvePublicAvatarUrl(p.id, p.avatar_url),
        };
      })
      .filter(Boolean);

    members.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
    return { ok: true, members };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      members: [],
    };
  }
}

export async function addGroupMember({ groupId, membreId }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!groupId || !UUID_RE.test(groupId) || !membreId || !UUID_RE.test(membreId)) {
    return { ok: false, error: "بيانات غير مكتملة" };
  }

  try {
    const { error } = await withTimeout(
      supabase.from("chat_group_members").insert({
        group_id: groupId,
        membre_id: membreId,
        role: "member",
      }),
      SUPABASE_TIMEOUT_MS,
      "إضافة عضو للمجموعة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "chat_group_members") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export async function removeGroupMember({ groupId, membreId }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!groupId || !UUID_RE.test(groupId) || !membreId || !UUID_RE.test(membreId)) {
    return { ok: false, error: "بيانات غير مكتملة" };
  }

  try {
    const { error } = await withTimeout(
      supabase
        .from("chat_group_members")
        .delete()
        .eq("group_id", groupId)
        .eq("membre_id", membreId)
        .neq("role", "admin"),
      SUPABASE_TIMEOUT_MS,
      "إزالة عضو من المجموعة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "chat_group_members") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export async function updateGroupName({ groupId, nom }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const name = String(nom || "").trim();
  if (!groupId || !UUID_RE.test(groupId)) {
    return { ok: false, error: "المجموعة غير محددة" };
  }
  if (!name) {
    return { ok: false, error: "اكتب اسم المجموعة" };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("chat_groups")
        .update({ nom: name, updated_at: new Date().toISOString() })
        .eq("id", groupId)
        .select("id, nom, avatar_url, seance_id")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "تحديث اسم المجموعة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "chat_groups") };
    }
    return { ok: true, group: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Métadonnées d'un groupe (nom, avatar, seance_id, mon rôle).
 */
export async function getChatGroup(groupId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!groupId || !UUID_RE.test(groupId)) {
    return { ok: false, error: "المجموعة غير محددة" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    const { data: group, error } = await withTimeout(
      supabase
        .from("chat_groups")
        .select("id, seance_id, nom, avatar_url")
        .eq("id", groupId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة المجموعة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "chat_groups") };
    }
    if (!group) {
      return { ok: false, error: "المجموعة غير موجودة" };
    }

    const { data: membership } = await withTimeout(
      supabase
        .from("chat_group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("membre_id", userId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة عضوية المجموعة"
    );

    return {
      ok: true,
      group: {
        id: group.id,
        seanceId: group.seance_id,
        name: group.nom,
        avatarUrl: resolvePublicGroupAvatarUrl(group.id, group.avatar_url),
        myRole: membership?.role || null,
        isAdmin: membership?.role === "admin",
      },
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export async function uploadGroupAvatar(groupId, localUri) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!groupId || !UUID_RE.test(groupId)) {
    return { ok: false, error: "المجموعة غير محددة" };
  }
  if (!localUri) {
    return { ok: false, error: "لم يتم اختيار صورة" };
  }

  try {
    const ImageManipulator = await import("expo-image-manipulator");
    const manipulated = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 512, height: 512 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    const response = await fetch(manipulated.uri);
    if (!response.ok) {
      return { ok: false, error: "تعذر قراءة الصورة المختارة" };
    }
    const buffer = await response.arrayBuffer();
    const path = groupAvatarObjectPath(groupId);

    const { error: uploadError } = await withTimeout(
      supabase.storage.from(GROUP_AVATAR_BUCKET).upload(path, buffer, {
        contentType: "image/jpeg",
        upsert: true,
      }),
      SUPABASE_TIMEOUT_MS,
      "رفع صورة المجموعة"
    );
    if (uploadError) {
      return { ok: false, error: mapStorageError(uploadError) };
    }

    const cacheBust = Date.now();
    const avatarUrl = buildPublicGroupAvatarUrl(groupId, cacheBust);
    if (!avatarUrl) {
      return { ok: false, error: "تعذر بناء رابط الصورة" };
    }

    const { error: updateError } = await withTimeout(
      supabase
        .from("chat_groups")
        .update({
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", groupId),
      SUPABASE_TIMEOUT_MS,
      "تحديث صورة المجموعة"
    );
    if (updateError) {
      return { ok: false, error: mapTableError(updateError, "chat_groups") };
    }

    return { ok: true, avatarUrl };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر رفع الصورة" };
  }
}

export async function removeGroupAvatar(groupId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!groupId || !UUID_RE.test(groupId)) {
    return { ok: false, error: "المجموعة غير محددة" };
  }

  try {
    const path = groupAvatarObjectPath(groupId);
    const { error: removeError } = await withTimeout(
      supabase.storage.from(GROUP_AVATAR_BUCKET).remove([path]),
      SUPABASE_TIMEOUT_MS,
      "حذف صورة المجموعة"
    );
    if (removeError) {
      return { ok: false, error: mapStorageError(removeError) };
    }

    const { error: updateError } = await withTimeout(
      supabase
        .from("chat_groups")
        .update({
          avatar_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", groupId),
      SUPABASE_TIMEOUT_MS,
      "تحديث صورة المجموعة"
    );
    if (updateError) {
      return { ok: false, error: mapTableError(updateError, "chat_groups") };
    }

    return { ok: true, avatarUrl: null };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر حذف الصورة" };
  }
}
