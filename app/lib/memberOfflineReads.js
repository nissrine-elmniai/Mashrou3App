import {
  OFFLINE_UNAVAILABLE_MESSAGE,
  cachedFetch,
  cacheKeySegment as seg,
  compactPositionForCache,
  filterProgressEntriesSince,
  mergeProgressHistoryForCache,
  unknownDataMessage,
} from "./offlineCache";
import {
  getMemberDeclaredHizbCount,
  getMemberSeasonObjectif,
  getMyCurrentProgressPosition,
  getMyProgress,
  getMySeasonProgress,
  PROGRESS_LOCKED_MESSAGE,
} from "./progressApi";
import { getMemberProfileFields, getMyActiveEnrollment } from "./membersApi";
import { getMyCurrentInscription } from "./messagesApi";
import { getMemberPresenceSummary } from "./presenceApi";
import { getMyObjectif } from "./objectifsApi";
import { getMyTestInvitations, getMyTestResults } from "./testsApi";
import {
  getUnacknowledgedAlerts,
  getVisibleAlerts,
  resolveMemberSeasonAlertCutoff,
} from "./alertsApi";
import { getActiveSeancesByGenre } from "./seancesApi";
import { fetchMySeasonRegistrationView } from "./memberApplicationsApi";

/**
 * Lectures des écrans MEMBRE, servies par cachedFetch (clés cache:v1:<authId>:mem.*).
 *
 * Donnée VIDE    : réponse réussie (ok: true), même sans ligne.
 * Donnée INCONNUE : échec sans cache (ok: false). Ne jamais l'afficher comme
 *                  un vide : utiliser unknownDataMessage(res).
 */

// Génériques (offlineCache) réexportés : les écrans du lot 2 les importent d'ici.
export { OFFLINE_UNAVAILABLE_MESSAGE, unknownDataMessage };

/** Genre arabe → segment ASCII de clé. */
function genreSeg(genre) {
  if (genre === "ذكر") return "m";
  if (genre === "أنثى") return "f";
  return "x";
}

/**
 * Historique du membre : UNE clé par saison (mem.progress.history.<saison>),
 * partagée par le tableau de bord (historique complet) et MemberProgressScreen
 * (saisies depuis l'inscription). Lignes allégées, au plus 100 (99 récentes +
 * la plus ancienne de la saison, pour un delta de saison exact).
 */
const MEMBER_HISTORY_CACHE_MAX = 100;

function memberHistoryKey(saisonId) {
  return `mem.progress.history.${seg(saisonId)}`;
}

/** Historique de progression (tableau de bord, ملفي), saison active. */
export function cachedMyProgressHistory(saisonId) {
  return cachedFetch(
    memberHistoryKey(saisonId),
    () => getMyProgress({ saisonId: saisonId || undefined }),
    {
      mergePrevious: true,
      toCache: (res, previous) =>
        mergeProgressHistoryForCache(res, previous, {
          cap: MEMBER_HISTORY_CACHE_MAX,
          saisonId,
        }),
    }
  );
}

/** Saisies depuis l'inscription (MemberProgressScreen). Même clé que l'historique. */
export async function cachedMyRecentProgress(saisonId, since) {
  const res = await cachedFetch(
    memberHistoryKey(saisonId),
    () => getMyProgress({ since: since || undefined, saisonId }),
    {
      mergePrevious: true,
      toCache: (result, previous) =>
        mergeProgressHistoryForCache(result, previous, {
          cap: MEMBER_HISTORY_CACHE_MAX,
          saisonId,
          since,
        }),
    }
  );
  // Servi du cache : ramené à la fenêtre demandée (comme la requête en ligne).
  if (res.fromCache) {
    return { ...res, entries: filterProgressEntriesSince(res.entries, since) };
  }
  return res;
}

export function cachedMyProgressPosition() {
  return cachedFetch("mem.progress.position", () => getMyCurrentProgressPosition(), {
    toCache: compactPositionForCache,
  });
}

/** Inscription active (verrou de saisie). saisonId sert seulement à la clé. */
export function cachedMyEnrollment(saisonId) {
  return cachedFetch(`mem.enrollment.${seg(saisonId)}`, () => getMyActiveEnrollment());
}

export function cachedMyObjectif(saisonId) {
  return cachedFetch(`mem.objectif.${seg(saisonId)}`, () => getMyObjectif(saisonId));
}

/** RPC get_member_season_progress (saison active côté serveur). */
export function cachedMySeasonProgress(saisonId) {
  return cachedFetch(`mem.seasonProgress.${seg(saisonId)}`, () => getMySeasonProgress());
}

export function cachedMyTestResults() {
  return cachedFetch("mem.tests.results", () => getMyTestResults());
}

export function cachedMyTestInvitations() {
  return cachedFetch("mem.tests.invitations", () => getMyTestInvitations());
}

function memberAlertScope(saisonId) {
  return { scopeToCurrentSeason: true, saisonId, role: "member" };
}

/** Aperçu des alertes de l'accueil (3 au plus). */
export function cachedAlertsPreview(saisonId) {
  return cachedFetch(`mem.alerts.preview.${seg(saisonId)}`, () =>
    getVisibleAlerts({ ...memberAlertScope(saisonId), limit: 3 })
  );
}

/** Alertes non acquittées : badge de la cloche. */
export function cachedPendingAlerts(saisonId) {
  return cachedFetch(`mem.alerts.pending.${seg(saisonId)}`, () =>
    getUnacknowledgedAlerts(memberAlertScope(saisonId))
  );
}

/** Date d'inscription à la saison (filtre des activités / historique). */
export function cachedSeasonCutoff(authId, saisonId) {
  return cachedFetch(`mem.alertCutoff.${seg(saisonId)}`, () =>
    resolveMemberSeasonAlertCutoff(authId, saisonId)
  );
}

export function cachedProfileFields(authId) {
  return cachedFetch("mem.profile.fields", () => getMemberProfileFields(authId));
}

export function cachedCurrentInscription(authId) {
  return cachedFetch("mem.inscription.current", () => getMyCurrentInscription(authId));
}

export function cachedPresenceSummary(authId, seanceId) {
  return cachedFetch(`mem.presence.${seg(seanceId)}`, () =>
    getMemberPresenceSummary(authId, seanceId)
  );
}

/** Nombre de hizb déclaré à l'inscription (suggestion de MemberProgress). */
export function cachedDeclaredHizb(authId, saisonId) {
  return cachedFetch(`mem.registration.declaredHizb.${seg(saisonId)}`, () =>
    getMemberDeclaredHizbCount(authId, saisonId)
  );
}

/** Objectif déclaré à l'inscription (suggestion de MemberProgress). */
export function cachedDeclaredGoal(authId, saisonId) {
  return cachedFetch(`mem.registration.declaredGoal.${seg(saisonId)}`, () =>
    getMemberSeasonObjectif(authId, saisonId)
  );
}

export function cachedSeancesByGenre(genre, saisonId) {
  return cachedFetch(
    `mem.registration.seances.${seg(saisonId)}.${genreSeg(genre)}`,
    () => getActiveSeancesByGenre(genre, saisonId)
  );
}

export function cachedRegistrationView(userId, seasonIds) {
  const ids = (seasonIds || []).map(seg).join("_");
  return cachedFetch(`mem.registration.view.${ids || "none"}`, () =>
    fetchMySeasonRegistrationView(userId, seasonIds)
  );
}

/**
 * Champs personnels inconnus (échec sans cache) : profil du compte tenu par
 * AppContext (dernier profil serveur), au format de getMemberProfileFields.
 */
export function memberInfoFromUser(user) {
  if (!user) return null;
  return {
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || null,
    telephone: user.phone || null,
    genre: user.gender || null,
    dateNaissance: user.birthDate || null,
    ecole: user.school || null,
    niveau: user.level || null,
    quantiteHifz: user.hifzAmount || null,
  };
}

/** Verrou de saisie avant le premier chargement : inchangé (non verrouillé). */
export const ENROLLMENT_LOCK_INITIAL = { locked: false, unknown: false, message: null };

/**
 * Verrou de saisie depuis la lecture de l'inscription.
 * Inscription inconnue (échec sans cache) : verrouillé, avec le message
 * « inconnu » au lieu de « non inscrit ».
 */
export function enrollmentLockFromResult(res) {
  if (res?.ok) {
    return {
      locked: !res.enrolled,
      unknown: false,
      message: res.enrolled ? null : PROGRESS_LOCKED_MESSAGE,
    };
  }
  return { locked: true, unknown: true, message: unknownDataMessage(res) };
}
