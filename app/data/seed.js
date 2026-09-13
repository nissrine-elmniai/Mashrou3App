import { ACCOUNT_STATUS, ROLES, SEASON_TYPES } from "../constants/roles";

/** Mot de passe des comptes mock — uniquement si Supabase n'est pas configuré */
export const DEMO_PASSWORD = "123456";

/** Comptes de démarrage locaux (dev sans .env). Jamais hydratés si Supabase est actif. */
export const bootstrapUsers = [
  {
    id: "u_admin",
    email: "admin@mosque.ma",
    password: DEMO_PASSWORD,
    firstName: "يوسف",
    lastName: "العلوي",
    birthDate: "1985/05/12",
    gender: "ذكر",
    role: ROLES.ADMIN,
    accountStatus: ACCOUNT_STATUS.ACTIVE,
  },
  {
    id: "u_supervisor",
    email: "superviseur@test.com",
    password: DEMO_PASSWORD,
    firstName: "أميمة",
    lastName: "العماري",
    birthDate: "1990/03/20",
    gender: "ذكر",
    role: ROLES.SUPERVISOR,
  },
  {
    id: "u_member",
    email: "membre@test.com",
    password: DEMO_PASSWORD,
    firstName: "أنس",
    lastName: "الفاسي",
    birthDate: "2010/07/09",
    gender: "ذكر",
    role: ROLES.MEMBER,
  },
];

/** Saison + groupe minimaux pour le mode local sans Supabase */
export const bootstrapSeasons = [
  {
    id: "s_bootstrap",
    name: "الموسم الدراسي 2026",
    type: SEASON_TYPES.REGULAR,
    startDate: "2026/09/01",
    version: 1,
    remote: false,
    registrationOpen: false,
    active: true,
  },
];

export const bootstrapGroups = [
  {
    id: "g_bootstrap",
    seasonId: "s_bootstrap",
    name: "مجموعة الفجر",
    freeTimeSlot: "بعد الفجر",
    supervisorId: "u_supervisor",
    memberIds: ["u_member"],
    schedule: "السبت - الاثنين - الأربعاء 5:30 صباحاً",
    remote: false,
  },
];

/** Programmes de mémorisation personnels du membre de test */
export const bootstrapMemberPrograms = [
  {
    id: "mp_bootstrap_1",
    userId: "u_member",
    title: "برنامج جزء عم",
    nbHizb: 3,
    durationDays: 30,
    startDate: "2025/01/01",
    completedTumuns: 16,
    type: "hifz",
  },
  {
    id: "mp_bootstrap_2",
    userId: "u_member",
    title: "برنامج متقدم",
    nbHizb: 10,
    durationDays: 90,
    startDate: "2025/01/15",
    completedTumuns: 20,
    type: "hifz",
  },
];

/** Progression de départ du membre de test — quelques أحزاب déjà mémorisés */
export const bootstrapProgress = [
  {
    id: "p_bootstrap",
    memberId: "u_member",
    groupId: "g_bootstrap",
    seasonId: "s_bootstrap",
    hifzPages: 30,
    reviewPages: 10,
    targetPages: 60,
    notes: [],
    lastEvaluation: "—",
  },
];

export const emptyState = {
  users: bootstrapUsers,
  seasons: bootstrapSeasons,
  registrations: [],
  groups: bootstrapGroups,
  progress: bootstrapProgress,
  attendance: [],
  exams: [],
  notifications: [],
  memberPrograms: bootstrapMemberPrograms,
  currentUserId: null,
};

/** Options d’horaires pour les formulaires d’inscription */
export const FREE_TIME_OPTIONS = [
  "بعد الفجر",
  "بعد الظهر",
  "بعد العصر",
  "بعد المغرب",
  "يوم السبت صباحا",
  "يوم الأحد صباحا",
];

export { SEASON_TYPES };
