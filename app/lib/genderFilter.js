/** Filtre de genre des écrans admin (annuaire, demandes). */
export const GENDER_FILTER_ALL = "all";
export const GENDER_MALE = "ذكر";
export const GENDER_FEMALE = "أنثى";

/** Pastilles de genre (pas de pastille « tous » : on désactive par un 2e appui). */
export const GENDER_TOGGLES = [
  [GENDER_MALE, "ذكور"],
  [GENDER_FEMALE, "إناث"],
];

/** Appui sur une pastille : l'active, ou revient à tous si elle l'était déjà. */
export function toggleGenderFilter(current, key) {
  return current === key ? GENDER_FILTER_ALL : key;
}

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
