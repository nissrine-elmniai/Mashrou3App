import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

const SUPABASE_TIMEOUT_MS = 15000;
const PAGE_SIZE = 30;

export const NOTIFICATION_CATEGORIES = [
  "chat",
  "presence",
  "inscriptions",
  "seances",
  "progression",
  "alertes",
  "systeme",
];

export const NOTIFICATION_CATEGORY_LABELS = {
  chat: "المحادثات",
  presence: "الحضور",
  inscriptions: "التسجيلات",
  seances: "الحصص والمواسم",
  progression: "التقدم",
  alertes: "تنبيهات الإدارة",
  systeme: "النظام",
};

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(`${label} — انتهت المهلة (${Math.round(ms / 1000)}ث)`)
          ),
        ms
      );
    }),
  ]);
}

function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/0065–0068 في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  return mapSupabaseAuthError(error);
}

async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

export function mapNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    eventType: row.event_type,
    title: row.title || "",
    body: row.body || "",
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    sourceTable: row.source_table || null,
    sourceId: row.source_id || null,
    readAt: row.read_at || null,
    createdAt: row.created_at,
    unread: !row.read_at,
  };
}

/**
 * Liste paginée des non-lues, plus récentes d'abord.
 * Hors catégorie alertes (cloche / gate admin, autre flux).
 * @param {{ offset?: number, limit?: number }} [options]
 */
export async function listMyNotifications(options = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", notifications: [] };
  }
  const offset = Number(options.offset) > 0 ? Number(options.offset) : 0;
  const limit = Number(options.limit) > 0 ? Number(options.limit) : PAGE_SIZE;
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("notifications")
        .select(
          "id, user_id, category, event_type, title, body, payload, source_table, source_id, read_at, created_at"
        )
        .is("read_at", null)
        .neq("category", "alertes")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      SUPABASE_TIMEOUT_MS,
      "قراءة الإشعارات"
    );
    if (error) {
      return {
        ok: false,
        error: mapTableError(error, "notifications"),
        notifications: [],
      };
    }
    return {
      ok: true,
      notifications: (data || []).map(mapNotificationRow).filter(Boolean),
      hasMore: (data || []).length === limit,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      notifications: [],
    };
  }
}

/** Compte les non-lues hors catégorie alertes (badge inbox). */
export async function countUnreadNotifications() {
  if (!isSupabaseConfigured()) {
    return { ok: true, count: 0 };
  }
  try {
    const { count, error } = await withTimeout(
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .neq("category", "alertes"),
      SUPABASE_TIMEOUT_MS,
      "عدّ الإشعارات غير المقروءة"
    );
    if (error) {
      return { ok: false, count: 0, error: mapTableError(error, "notifications") };
    }
    return { ok: true, count: count || 0 };
  } catch (e) {
    return { ok: false, count: 0, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export async function markNotificationRead(notificationId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!notificationId) {
    return { ok: false, error: "معرّف الإشعار مفقود" };
  }
  try {
    const { error } = await withTimeout(
      supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notificationId)
        .is("read_at", null),
      SUPABASE_TIMEOUT_MS,
      "تحديث حالة القراءة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "notifications") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export async function markAllNotificationsRead() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }
  try {
    const { error } = await withTimeout(
      supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null)
        .neq("category", "alertes"),
      SUPABASE_TIMEOUT_MS,
      "تعليم الكل كمقروء"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "notifications") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export function emptyNotificationPreferences() {
  return {
    chat: true,
    presence: true,
    inscriptions: true,
    seances: true,
    progression: true,
    alertes: true,
    systeme: true,
  };
}

function mapPrefsRow(row) {
  if (!row) return emptyNotificationPreferences();
  return {
    chat: row.chat !== false,
    presence: row.presence !== false,
    inscriptions: row.inscriptions !== false,
    seances: row.seances !== false,
    progression: row.progression !== false,
    alertes: row.alertes !== false,
    systeme: row.systeme !== false,
  };
}

export async function getNotificationPreferences() {
  if (!isSupabaseConfigured()) {
    return { ok: true, preferences: emptyNotificationPreferences() };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة تفضيلات الإشعارات"
    );
    if (error) {
      return {
        ok: false,
        error: mapTableError(error, "notification_preferences"),
      };
    }
    if (data) {
      return { ok: true, preferences: mapPrefsRow(data) };
    }
    const { error: insertError } = await withTimeout(
      supabase.from("notification_preferences").insert({ user_id: userId }),
      SUPABASE_TIMEOUT_MS,
      "إنشاء تفضيلات الإشعارات"
    );
    if (insertError && !/duplicate key|23505/i.test(insertError.message || "")) {
      return {
        ok: false,
        error: mapTableError(insertError, "notification_preferences"),
      };
    }
    return { ok: true, preferences: emptyNotificationPreferences() };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export async function updateNotificationPreferences(patch = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }
  const allowed = new Set(NOTIFICATION_CATEGORIES);
  const row = { updated_at: new Date().toISOString() };
  for (const key of Object.keys(patch)) {
    if (allowed.has(key)) {
      row[key] = !!patch[key];
    }
  }
  if (Object.keys(row).length <= 1) {
    return { ok: false, error: "لا توجد بيانات للتحديث" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("notification_preferences")
        .update(row)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "حفظ تفضيلات الإشعارات"
    );
    if (error) {
      return {
        ok: false,
        error: mapTableError(error, "notification_preferences"),
      };
    }
    if (!data) {
      const insertRow = {
        user_id: userId,
        ...row,
      };
      const { data: created, error: insertError } = await withTimeout(
        supabase
          .from("notification_preferences")
          .insert(insertRow)
          .select("*")
          .maybeSingle(),
        SUPABASE_TIMEOUT_MS,
        "حفظ تفضيلات الإشعارات"
      );
      if (insertError) {
        return {
          ok: false,
          error: mapTableError(insertError, "notification_preferences"),
        };
      }
      return { ok: true, preferences: mapPrefsRow(created) };
    }
    return { ok: true, preferences: mapPrefsRow(data) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Notification de test (RPC SECURITY DEFINER). Destinataire = soi, sauf admin. */
export async function enqueueTestNotification(userId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const target = userId || (await currentAuthId());
  if (!target) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc("enqueue_test_notification", { p_user_id: target }),
      SUPABASE_TIMEOUT_MS,
      "إرسال إشعار تجريبي"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "notifications") };
    }
    return { ok: true, id: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر إرسال الإشعار التجريبي" };
  }
}

/**
 * Realtime INSERT/UPDATE sur ses lignes (RLS).
 * @returns {() => void}
 */
export function subscribeMyNotifications(onChange) {
  if (!isSupabaseConfigured() || typeof onChange !== "function") {
    return () => {};
  }
  let channel = null;
  let cancelled = false;
  (async () => {
    const userId = await currentAuthId();
    if (!userId || cancelled) return;
    channel = supabase.channel(`notifications_inbox_${userId}_${Date.now()}`);
    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onChange(payload);
        }
      )
      .subscribe();
  })();
  return () => {
    cancelled = true;
    if (channel) {
      supabase.removeChannel(channel);
    }
  };
}
