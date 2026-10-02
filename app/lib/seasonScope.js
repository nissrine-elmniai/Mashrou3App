import { SEASON_TYPES } from "../constants/roles";

function seasonTypeOf(season) {
  return String(season?.type || "")
    .trim()
    .toLowerCase();
}

/** Musim ordinaire actif (ou le premier musim ordinaire en secours). */
export function getActiveRegularSeason(seasons = []) {
  const list = seasons || [];
  return (
    list.find(
      (s) => s.active && seasonTypeOf(s) === SEASON_TYPES.REGULAR
    ) ||
    list.find((s) => seasonTypeOf(s) === SEASON_TYPES.REGULAR) ||
    list.find((s) => s.active) ||
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

/**
 * Superviseurs d'une séance active de CETTE saison.
 * Une séance archivée, inactive, ou sans saison_id ne compte pas :
 * son profil peut encore avoir role = 'supervisor' (compte +supervisor
 * ou séance d'un musim précédent) sans figurer dans « المشرفون ».
 */
export function supervisorIdsForSeason(seances = [], seasonId) {
  if (!seasonId) return new Set();
  return new Set(
    (seances || [])
      .filter(
        (s) =>
          s.statut === "active" &&
          s.saison_id === seasonId &&
          s.superviseur_id
      )
      .map((s) => s.superviseur_id)
  );
}
