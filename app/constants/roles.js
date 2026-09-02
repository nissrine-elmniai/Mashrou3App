export const ROLES = {
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  MEMBER: "member",
};

export const ROLE_LABELS = {
  admin: "مسؤول لجنة المسجد",
  supervisor: "مسؤول فرعي",
  member: "عضو",
};

export const DASHBOARD_BY_ROLE = {
  admin: "AdminDashboard",
  supervisor: "SupervisorDashboard",
  member: "MemberDashboardScreen",
};

/** Liste des rôles d’un utilisateur (role principal + roles[]) */
export function normalizeRoles(user) {
  const set = new Set();
  if (user?.role) set.add(user.role);
  if (Array.isArray(user?.roles)) {
    user.roles.forEach((r) => {
      if (r) set.add(r);
    });
  }
  return [...set];
}

export function userHasRole(user, role) {
  return normalizeRoles(user).includes(role);
}

/**
 * Rôle de session pour le routing (Admin > Superviseur > Membre), avec preferredRole
 * optionnel (ex. écran de connexion dédié).
 */
export function resolveSessionRole(user, preferredRole = null) {
  if (preferredRole && userHasRole(user, preferredRole)) {
    return preferredRole;
  }
  if (userHasRole(user, ROLES.ADMIN)) return ROLES.ADMIN;
  if (userHasRole(user, ROLES.SUPERVISOR)) return ROLES.SUPERVISOR;
  if (userHasRole(user, ROLES.MEMBER)) return ROLES.MEMBER;
  return user?.role || ROLES.MEMBER;
}

export function withMergedRoles(user, extraRole) {
  const roles = normalizeRoles({
    ...user,
    roles: [...normalizeRoles(user), extraRole],
  });
  return { ...user, roles };
}

export const SEASON_TYPES = {
  REGULAR: "regular",
  SUMMER: "summer",
};

export const SEASON_TYPE_LABELS = {
  regular: "موسم عادي",
  summer: "مدرسة صيفية",
};

/** Statuts du parcours d’inscription membre */
export const REGISTRATION_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  INVITED: "invited",
  ACTIVATED: "activated",
};

export const REGISTRATION_STATUS_LABELS = {
  pending: "قيد المراجعة",
  accepted: "مقبول",
  rejected: "مرفوض",
  invited: "تم إرسال الدعوة",
  activated: "تم إنشاء الحساب",
};

/** نوع الطلب: انضمام أول مرة أو إعادة تسجيل موسم */
export const REGISTRATION_KIND = {
  JOIN: "join",
  SEASON_RENEWAL: "season_renewal",
};

export const REGISTRATION_KIND_LABELS = {
  join: "طلب انضمام",
  season_renewal: "إعادة تسجيل موسم",
};

export function getRegistrationKind(reg) {
  if (reg?.kind) return reg.kind;
  if (reg?.userId) return REGISTRATION_KIND.SEASON_RENEWAL;
  return REGISTRATION_KIND.JOIN;
}

/** Étapes UI du stepper (1-based) */
export const REGISTRATION_STEPS = [
  { key: "register", label: "التسجيل" },
  { key: "review", label: "المراجعة" },
  { key: "accepted", label: "مقبول" },
  { key: "invite", label: "الدعوة" },
  { key: "account", label: "إنشاء حساب" },
];

export function registrationStepIndex(status) {
  switch (status) {
    case REGISTRATION_STATUS.PENDING:
      return 2;
    case REGISTRATION_STATUS.ACCEPTED:
      return 3;
    case REGISTRATION_STATUS.INVITED:
      return 4;
    case REGISTRATION_STATUS.ACTIVATED:
      return 5;
    case REGISTRATION_STATUS.REJECTED:
      return 2;
    default:
      return 1;
  }
}

/** Compte pas encore activé (invitation) */
export const ACCOUNT_STATUS = {
  INVITED: "invited",
  ACTIVE: "active",
};

/** الجنس — طلب الانضمام والحصص */
export const GENDER_OPTIONS = [
  { value: "ذكر", label: "ذكر" },
  { value: "أنثى", label: "أنثى" },
];

/** مستويات حفظ القرآن */
export const LEVEL_OPTIONS = [
  "مبتدئ",
  "متوسط",
  "متمكن",
  "متقدم",
  "حافظ أجزاء",
  "حافظ القرآن",
];

export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  ABSENT: "absent",
  UNSET: "unset",
};
