/** Filtre de genre des écrans admin (annuaire, demandes). */
export const GENDER_FILTER_ALL = "all";
export const GENDER_MALE = "ذكر";
export const GENDER_FEMALE = "أنثى";

// « الجميع » : ne pas répéter le « الكل » des autres filtres de l'écran.
export const GENDER_FILTERS = [
  [GENDER_FILTER_ALL, "الجميع"],
  [GENDER_MALE, "ذكور"],
  [GENDER_FEMALE, "إناث"],
];

/** « ذكر » / « أنثى », sinon null (genre inconnu). */
export function normalizeGender(raw) {
  const value = String(raw || "").trim();
  return value === GENDER_MALE || value === GENDER_FEMALE ? value : null;
}

/** Genre inconnu : visible seulement dans « الكل ». */
export function matchesGenderFilter(gender, filter) {
  if (filter === GENDER_FILTER_ALL) return true;
  return gender === filter;
}
