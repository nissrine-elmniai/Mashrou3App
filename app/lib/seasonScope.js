import { SEASON_TYPES } from "../constants/roles";

/** Musim ordinaire actif (ou le premier musim ordinaire en secours). */
export function getActiveRegularSeason(seasons = []) {
  return (
    seasons.find((s) => s.active && s.type === SEASON_TYPES.REGULAR) ||
    seasons.find((s) => s.type === SEASON_TYPES.REGULAR) ||
    null
  );
}

/**
 * Inscription membre ouverte uniquement si le musim est actif ET
 * registrationOpen (ouvert par « انطلاق موسم جديد » / annonce été).
 */
export function isSeasonRegistrationAvailable(season) {
  return !!(season && season.active && season.registrationOpen);
}

/** Musims d'un type ouverts à l'inscription membre. */
export function getOpenRegistrationSeasons(seasons = [], type) {
  return (seasons || []).filter(
    (s) => s.type === type && isSeasonRegistrationAvailable(s)
  );
}

export function filterBySeasonId(items = [], seasonId, getId = (x) => x?.seasonId) {
  if (!seasonId) return [];
  return items.filter((item) => getId(item) === seasonId);
}

export function filterSeancesForSeason(seances = [], seasonId) {
  if (!seasonId) return [];
  return seances.filter(
    (s) =>
      s.statut !== "archivee" &&
      (s.saison_id === seasonId || s.saison_id == null || s.saison_id === "")
  );
}

export function supervisorIdsForSeason(seances = [], seasonId) {
  return new Set(
    filterSeancesForSeason(seances, seasonId)
      .map((s) => s.superviseur_id)
      .filter(Boolean)
  );
}
