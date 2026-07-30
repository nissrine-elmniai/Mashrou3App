import { ROLES, SEASON_TYPES } from "../constants/roles";

/** Mot de passe du compte admin initial uniquement */
export const DEMO_PASSWORD = "123456";

/** Comptes de démarrage — le reste se crée dynamiquement dans l’app */
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
  },
  {
    id: "u_supervisor",
    email: "superviseur@test.com",
    password: "123456",
    firstName: "أميمة",
    lastName: "العماري",
    birthDate: "1990/03/20",
    gender: "ذكر",
    role: ROLES.SUPERVISOR,
  },
  {
    id: "u_member",
    email: "membre@test.com",
    password: "123456",
    firstName: "أنس",
    lastName: "الفاسي",
    birthDate: "2010/07/09",
    gender: "ذكر",
    role: ROLES.MEMBER,
  },
  {
    // Compte superviseur seedé côté Supabase (voir scripts/seed-supervisor-test.js) —
    // dupliqué ici pour que la recherche mock de login() réussisse avec les mêmes
    // identifiants, ce qui déclenche ensuite la tentative supabase.auth.signInWithPassword.
    id: "u_supervisor_supabase",
    email: "elaammarioumeima@gmail.com",
    password: "Test1234!",
    firstName: "Oumeyma",
    lastName: "Elaammari",
    birthDate: "1990/01/01",
    gender: "أنثى",
    role: ROLES.SUPERVISOR,
  },
];

/** Saison + groupe minimaux pour que le superviseur de test ait une séance assignée */
export const bootstrapSeasons = [
  {
    id: "s_bootstrap",
    name: "الموسم الدراسي 2026",
    type: SEASON_TYPES.REGULAR,
    startDate: "2026/09/01",
    endDate: "2027/06/30",
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
