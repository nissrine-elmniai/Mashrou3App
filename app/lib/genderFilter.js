/** Filtre de genre des écrans admin (annuaire, demandes). */
export const GENDER_FILTER_ALL = "all";
export const GENDER_MALE = "ذكر";
export const GENDER_FEMALE = "أنثى";

export const GENDER_FILTERS = [
  [GENDER_FILTER_ALL, "الكل"],
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

/** Compteurs { all, ذكر, أنثى } d'une liste, via getGender(item). */
export function countByGender(items, getGender) {
  const counts = { [GENDER_FILTER_ALL]: 0, [GENDER_MALE]: 0, [GENDER_FEMALE]: 0 };
  (items || []).forEach((item) => {
    counts[GENDER_FILTER_ALL] += 1;
    const gender = getGender(item);
    if (gender) counts[gender] += 1;
  });
  return counts;
}
