import { SEASON_TYPES } from "../constants/roles";

function seasonTypeOf(season) {
  return String(season?.type || "")
    .trim()
    .toLowerCase();
}

/** Première saison active, quel que soit le type. Pour l'écriture de progression. */
export function getActiveSeason(seasons = []) {
  return (seasons || []).find((season) => season?.active) || null;
}

/**
 * Saison active uniquement (active = true).
 * Le type regular est prioritaire. Aucune saison active → null.
 * Jamais de repli sur un musim inactif.
 */
export function getActiveRegularSeason(seasons = []) {
  const active = (seasons || []).filter((season) => season?.active);
  return (
    active.find((season) => seasonTypeOf(season) === SEASON_TYPES.REGULAR) ||
    active[0] ||
    null
  );
}

/**
 * Saison de l'accueil admin : n'importe quel type actif.
 * Plusieurs actives → la plus récente (createdAt), et multiple = true.
 */
export function pickDisplayedActiveSeason(seasons = []) {
  const active = (seasons || []).filter((season) => season?.active);
  if (!active.length) return { season: null, multiple: false };
  const ranked = [...active].sort((a, b) => {
    const aAt = Date.parse(a?.createdAt || "") || 0;
    const bAt = Date.parse(b?.createdAt || "") || 0;
    if (bAt !== aAt) return bAt - aAt;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
  return { season: ranked[0], multiple: active.length > 1 };
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
