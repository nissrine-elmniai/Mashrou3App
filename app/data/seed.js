import { ROLES, SEASON_TYPES } from "../constants/roles";

/** Mot de passe du compte admin initial uniquement */
export const DEMO_PASSWORD = "123456";

/** Compte admin de démarrage — le reste se crée dynamiquement dans l’app */
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
];

export const emptyState = {
  users: bootstrapUsers,
  seasons: [],
  registrations: [],
  groups: [],
  progress: [],
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
