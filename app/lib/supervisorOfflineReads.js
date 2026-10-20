import {
  cachedFetch,
  cacheKeySegment as seg,
  compactPositionForCache,
  compactProgressRow,
  filterProgressEntriesSince,
  mergeProgressHistoryForCache,
} from "./offlineCache";
import {
  getMemberProfileFields,
  getSeanceMembers,
  getSupervisorActiveSeances,
  loadCurrentMemberSeance,
} from "./membersApi";
import {
  buildSeanceAttendanceHistory,
  getMemberPresenceSummary,
  getPresenceReminderForOccurrence,
  getSeancePresenceForDate,
} from "./presenceApi";
import {
  countMembersWithNewProgress,
  getCurrentProgressPosition,
  getMemberProgressEntries,
  getMemberProgressionSummary,
} from "./progressApi";
import { getMemberObjectif } from "./objectifsApi";
import {
  getUnacknowledgedAlerts,
  getVisibleAlerts,
  resolveMemberSeasonAlertCutoff,
} from "./alertsApi";
import {
  fetchSeanceInscriptionActivity,
  fetchSeancePresenceActivity,
  fetchSeanceProgressActivity,
} from "./supervisorActivityApi";

/**
 * Lectures des écrans SUPERVISEUR, servies par cachedFetch
 * (clés cache:v1:<authId>:sup.*). Données par séance : seanceId dans la clé
 * (un superviseur peut avoir une séance regular et une séance summer).
 * Décision produit : téléphones et infos des membres de la séance en cache.
 */

/** Séances actives du superviseur connecté. */
export function cachedSupervisorSeances(authId) {
  return cachedFetch("sup.seances.active", () => getSupervisorActiveSeances(authId));
}

/**
 * Membres d'une séance. Clé unique, partagée avec la messagerie (lot 4) :
 * sup.seanceMembers.<seanceId>.
 */
export function cachedSeanceMembers(seanceId) {
  return cachedFetch(`sup.seanceMembers.${seg(seanceId)}`, () =>
    getSeanceMembers(seanceId)
  );
}

/** Présence d'une séance pour un jour (tableau de bord et détail du jour). */
export function cachedSeancePresenceForDate(seanceId, sessionDate, memberIds) {
  return cachedFetch(
    `sup.presence.${seg(seanceId)}.${seg(sessionDate)}`,
    () => getSeancePresenceForDate(seanceId, sessionDate, memberIds)
  );
}

export function cachedPresenceReminder(seanceId, sessionDate) {
  return cachedFetch(
    `sup.presenceReminder.${seg(seanceId)}.${seg(sessionDate)}`,
    () => getPresenceReminderForOccurrence(seanceId, sessionDate)
  );
}

/** Historique des séances (taux global du tableau de bord + écran الحضور). */
export function cachedAttendanceHistory(seanceId, jour, heureDebut, saisonDateDebut, memberIds) {
  return cachedFetch(`sup.attendanceHistory.${seg(seanceId)}`, () =>
    buildSeanceAttendanceHistory(seanceId, jour, heureDebut, saisonDateDebut, memberIds)
  );
}

/**
 * Dernière position de chaque membre d'une séance (N × limit 1), en une entrée.
 * Échec isolé : ce membre reste sans position (comme avant). Tous en échec :
 * ok:false, pour que cachedFetch serve le cache hors ligne.
 * @returns {{ ok, byId: Record<string, { metrics, entry } | null> }}
 */
export function cachedSeanceProgressSummary(seanceId, memberIds) {
  const ids = (memberIds || []).filter(Boolean);
  return cachedFetch(`sup.seanceProgress.${seg(seanceId)}`, async () => {
    const pairs = await Promise.all(
      ids.map(async (id) => {
        try {
          return [id, await getMemberProgressionSummary(id)];
        } catch (e) {
          return [id, { ok: false, error: e?.message }];
        }
      })
    );
    const failures = pairs.filter(([, res]) => !res?.ok);
    if (ids.length > 0 && failures.length === ids.length) {
      return { ok: false, error: failures[0][1]?.error };
    }
    const byId = {};
    pairs.forEach(([id, res]) => {
      if (!res?.ok) {
        console.warn("useSupervisorMembers: échec lecture progression —", id, res?.error);
      }
      byId[id] =
        res?.ok && res.hasData && res.metrics
          ? { metrics: res.metrics, entry: res.entry || null }
          : null;
    });
    return { ok: true, byId };
  }, { toCache: compactSeanceProgressForCache });
}

/** Positions de la séance en cache : lignes de progression allégées. */
function compactSeanceProgressForCache(result) {
  const byId = {};
  Object.entries(result?.byId || {}).forEach(([id, prog]) => {
    byId[id] = prog ? { ...prog, entry: compactProgressRow(prog.entry) } : null;
  });
  return { ...result, byId };
}

/**
 * Nombre de membres avec un nouveau progrès depuis seen_at.
 * Hors ligne : dernier compte connu (seen_at a pu avancer depuis).
 */
export function cachedNewProgressCount(seanceId, sinceIso) {
  return cachedFetch(`sup.newProgressCount.${seg(seanceId)}`, () =>
    countMembersWithNewProgress(seanceId, sinceIso)
  );
}

function supervisorAlertScope(saisonId) {
  return { scopeToCurrentSeason: true, saisonId, role: "supervisor" };
}

export function cachedSupervisorAlertsPreview(saisonId) {
  return cachedFetch(`sup.alerts.preview.${seg(saisonId)}`, () =>
    getVisibleAlerts({ ...supervisorAlertScope(saisonId), limit: 3 })
  );
}

export function cachedSupervisorPendingAlerts(saisonId) {
  return cachedFetch(`sup.alerts.pending.${seg(saisonId)}`, () =>
    getUnacknowledgedAlerts(supervisorAlertScope(saisonId))
  );
}

/** L'accueil affiche 5 activités au plus : 5 lignes par source en cache. */
const ACTIVITY_CACHE_MAX = 5;

function activityAtMs(row) {
  const t = new Date(String(row?.at || "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

function trimActivityForCache(res) {
  const rows = Array.isArray(res?.rows) ? res.rows : [];
  return {
    ...res,
    rows: [...rows]
      .sort((a, b) => activityAtMs(b) - activityAtMs(a))
      .slice(0, ACTIVITY_CACHE_MAX),
  };
}

/** Activité de la séance (accueil). En ligne : lignes complètes (80 / 200). */
export function cachedSeanceActivity(seanceId, memberIds, sinceIso) {
  const key = seg(seanceId);
  const options = { toCache: trimActivityForCache };
  return Promise.all([
    cachedFetch(
      `sup.activity.progress.${key}`,
      () => fetchSeanceProgressActivity(memberIds, sinceIso),
      options
    ),
    cachedFetch(
      `sup.activity.presence.${key}`,
      () => fetchSeancePresenceActivity(seanceId, sinceIso),
      options
    ),
    cachedFetch(
      `sup.activity.inscriptions.${key}`,
      () => fetchSeanceInscriptionActivity(seanceId, sinceIso),
      options
    ),
  ]);
}

/*
 * ---- Fiche d'un membre : <rôle>.member.<memberId>.* ----
 * rolePrefix : "sup" (vue superviseur, par défaut) ou "adm" (vue admin, lot 5).
 */

function memberKey(memberId, resource, rolePrefix = "sup") {
  return `${rolePrefix}.member.${seg(memberId)}.${resource}`;
}

export function cachedMemberSeance(memberId, rolePrefix) {
  return cachedFetch(memberKey(memberId, "seance", rolePrefix), () =>
    loadCurrentMemberSeance(memberId)
  );
}

export function cachedMemberFields(memberId, rolePrefix) {
  return cachedFetch(memberKey(memberId, "fields", rolePrefix), () =>
    getMemberProfileFields(memberId)
  );
}

export function cachedMemberPosition(memberId, rolePrefix) {
  return cachedFetch(
    memberKey(memberId, "position", rolePrefix),
    () => getCurrentProgressPosition(memberId),
    { toCache: compactPositionForCache }
  );
}

export function cachedMemberObjectif(memberId, saisonId, rolePrefix) {
  return cachedFetch(memberKey(memberId, `objectif.${seg(saisonId)}`, rolePrefix), () =>
    getMemberObjectif(memberId, saisonId)
  );
}

export function cachedMemberPresence(memberId, seanceId, rolePrefix) {
  return cachedFetch(memberKey(memberId, `presence.${seg(seanceId)}`, rolePrefix), () =>
    getMemberPresenceSummary(memberId, seanceId)
  );
}

/**
 * Historique d'un membre : UNE clé (<rôle>.member.<id>.progress), partagée par la
 * fiche (historique complet → rythme) et l'écran التقدم (90 jours → grille,
 * 10 lignes, rythme). Lignes allégées, dédoublonnées, au plus 150 (149 récentes
 * + la plus ancienne de la saison, pour un delta de saison exact).
 */
const MEMBER_PROGRESS_CACHE_MAX = 150;

function memberProgressOptions(saisonId, since = null, limit = null) {
  return {
    mergePrevious: true,
    toCache: (result, previous) =>
      mergeProgressHistoryForCache(result, previous, {
        cap: MEMBER_PROGRESS_CACHE_MAX,
        saisonId,
        since,
        limit,
      }),
  };
}

/** Historique complet d'un membre (rythme de la fiche). */
export function cachedMemberPaceHistory(memberId, saisonId, rolePrefix) {
  return cachedFetch(
    memberKey(memberId, "progress", rolePrefix),
    () => getMemberProgressEntries(memberId),
    memberProgressOptions(saisonId)
  );
}

/**
 * Saisies récentes d'un membre (écran التقدم), requête bornée (since, limit).
 * Servi du cache : ramené à la même fenêtre que la requête en ligne.
 */
export async function cachedMemberRecentHistory(memberId, since, limit, saisonId = null) {
  const res = await cachedFetch(
    memberKey(memberId, "progress"),
    () => getMemberProgressEntries(memberId, { since, limit }),
    memberProgressOptions(saisonId, since, limit)
  );
  if (res.fromCache) {
    return { ...res, entries: filterProgressEntriesSince(res.entries, since, limit) };
  }
  return res;
}

export function cachedMemberCutoff(memberId, saisonId) {
  return cachedFetch(memberKey(memberId, `cutoff.${seg(saisonId)}`), () =>
    resolveMemberSeasonAlertCutoff(memberId, saisonId)
  );
}
