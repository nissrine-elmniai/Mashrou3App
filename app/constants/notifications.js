/**
 * Catégories de notifications → éléments de menu / onglets.
 * Les badges du menu comptent uniquement les notifications non lues
 * de la catégorie correspondante (saison + utilisateur).
 */

export const NOTIF_CATEGORY = {
  /** Admin — طلبات التسجيل / الانضمام */
  REGISTRATIONS: "registrations",
  /** Admin — الحصص */
  SESSIONS: "sessions",
  /** Admin — الاختبارات / التقييمات */
  TESTS: "tests",
  /** Admin — المشرفون */
  SUPERVISORS: "supervisors",
  /** Admin — الأعضاء */
  MEMBERS: "members",
  /** Admin — التنبيهات */
  NOTIFICATIONS: "notifications",
  /** Membre — تبويب التسجيل */
  REGISTRATION: "registration",
  /** Membre / superviseur — تنبيهات الإدارة (écran alertes) */
  ALERTS: "alerts",
};

/** id menu AdminSidebar → catégorie notification */
export const ADMIN_MENU_TO_CATEGORY = {
  registrations: NOTIF_CATEGORY.REGISTRATIONS,
  sessions: NOTIF_CATEGORY.SESSIONS,
  tests: NOTIF_CATEGORY.TESTS,
  supervisors: NOTIF_CATEGORY.SUPERVISORS,
  members: NOTIF_CATEGORY.MEMBERS,
  notifications: NOTIF_CATEGORY.NOTIFICATIONS,
};

/** Infère une catégorie à partir du titre (notifications déjà en mémoire). */
export function inferNotificationCategory({ title, category, audience } = {}) {
  if (category) return category;
  const t = String(title || "");

  if (
    /طلب انضمام|إعادة تسجيل|طلبات التسجيل|رُفضت إعادة|تم رفض طلب|قُبل تسجيلك|إعادة تسجيل مقبولة|دعوة انضمام/.test(
      t
    )
  ) {
    return NOTIF_CATEGORY.REGISTRATIONS;
  }
  if (/فتح باب التسجيل|انطلاق موسم/.test(t)) {
    return audience === "admin"
      ? NOTIF_CATEGORY.REGISTRATIONS
      : NOTIF_CATEGORY.REGISTRATION;
  }
  if (/توزيعك على مجموعة|حصة|مجموعة/.test(t)) {
    return NOTIF_CATEGORY.SESSIONS;
  }
  if (/اختبار|نتيجة اختبار|تقييم/.test(t)) {
    return NOTIF_CATEGORY.TESTS;
  }
  if (/مشرف/.test(t)) {
    return NOTIF_CATEGORY.SUPERVISORS;
  }
  if (/تنبيه/.test(t)) {
    return audience === "admin"
      ? NOTIF_CATEGORY.NOTIFICATIONS
      : NOTIF_CATEGORY.ALERTS;
  }
  if (audience === "admin") {
    return NOTIF_CATEGORY.NOTIFICATIONS;
  }
  return NOTIF_CATEGORY.ALERTS;
}

export function formatMenuBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  return n > 9 ? "9+" : String(n);
}
