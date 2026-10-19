import { cachedFetch } from "./offlineCache";
import { USER_ERROR_MESSAGES } from "./userError";
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

export const OFFLINE_UNAVAILABLE_MESSAGE = "غير متاح دون اتصال";

/** Texte d'une donnée inconnue : hors ligne → message fixe ; en ligne → erreur actuelle. */
export function unknownDataMessage(res, fallback) {
  if (res?.offline) return OFFLINE_UNAVAILABLE_MESSAGE;
  return res?.error || fallback || USER_ERROR_MESSAGES.unknown;
}

/** Segment de clé autorisé par offlineCache ([A-Za-z0-9_.:-]). */
function seg(value) {
  const raw = value == null || value === "" ? "none" : String(value);
  return raw.replace(/[^A-Za-z0-9_:-]/g, "_");
}

/** Genre arabe → segment ASCII de clé. */
function genreSeg(genre) {
  if (genre === "ذكر") return "m";
  if (genre === "أنثى") return "f";
  return "x";
}

/** Historique : lignes conservées dans le cache (au plus 100). */
const HISTORY_CACHE_MAX = 100;
/** MemberProgressScreen n'affiche que les 5 dernières saisies. */
const RECENT_CACHE_MAX = 5;

function entryDateMs(entry) {
  const t = new Date(String(entry?.date || entry?.date_saisie || entry?.created_at || "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Historique du tableau de bord (activités + rythme) : les 99 lignes les plus
 * récentes, plus la plus ancienne de la saison (delta de saison exact hors ligne).
 */
function trimHistoryForCache(result, saisonId) {
  const entries = Array.isArray(result?.entries) ? result.entries : [];
  if (entries.length <= HISTORY_CACHE_MAX) return result;
  const kept = entries.slice(0, HISTORY_CACHE_MAX - 1);
  const sid = saisonId == null ? "" : String(saisonId);
  const ofSeason = sid
    ? entries.filter((e) => e?.saison_id != null && String(e.saison_id) === sid)
    : [];
  if (ofSeason.length > 0) {
    const oldest = ofSeason.reduce((a, b) => (entryDateMs(b) < entryDateMs(a) ? b : a));
    if (!kept.includes(oldest)) kept.push(oldest);
  } else {
    kept.push(entries[HISTORY_CACHE_MAX - 1]);
  }
  return { ...result, entries: kept };
}

/** Historique de progression (tableau de bord, ملفي), saison active. */
export function cachedMyProgressHistory(saisonId) {
  return cachedFetch(
    `mem.progress.history.${seg(saisonId)}`,
    () => getMyProgress({ saisonId: saisonId || undefined }),
    { toCache: (res) => trimHistoryForCache(res, saisonId) }
  );
}

/** Dernières saisies affichées par MemberProgressScreen (5 au plus en cache). */
export function cachedMyRecentProgress(saisonId, since) {
  return cachedFetch(
    `mem.progress.recent.${seg(saisonId)}`,
    () => getMyProgress({ since: since || undefined, saisonId }),
    {
      toCache: (res) => ({
        ...res,
        entries: (res?.entries || []).slice(0, RECENT_CACHE_MAX),
      }),
    }
  );
}

export function cachedMyProgressPosition() {
  return cachedFetch("mem.progress.position", () => getMyCurrentProgressPosition());
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
