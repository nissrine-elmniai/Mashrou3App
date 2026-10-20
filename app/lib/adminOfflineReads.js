import { cachedFetch, cacheKeySegment as seg } from "./offlineCache";
import { fetchSeasonDirectory, getSeasonDashboardStats } from "./saisonsApi";
import {
  getAllAcceptedInscriptions,
  getAllSeances,
  getAssignableSupervisors,
  getMemberProfiles,
  getSupervisorProfiles,
} from "./seancesApi";
import {
  findAdminSeanceAssignmentSeason,
  getProfileRoles,
  getSeanceMembers,
} from "./membersApi";
import { getSeancePresenceOverview } from "./presenceApi";
import {
  countPlannedTestsAdmin,
  countTestsAdmin,
  getAllTestsAdmin,
  getTestDates,
  listRecentTestsAdmin,
} from "./testsApi";
import { getAllAlertsAdmin, listRecentAlertsAdmin } from "./alertsApi";
import { fetchProfile } from "./auth";
import { filterSeancesForSeason } from "./seasonScope";

/**
 * Lectures des écrans ADMIN, servies par cachedFetch (clés cache:v1:<authId>:adm.*).
 * Décision produit : liste des membres (téléphones et e-mails compris) en cache.
 * Jamais en cache (fetchOnlineOnly dans les écrans) : demandes d'inscription,
 * notes et invitations nominatives des tests, statistiques, invitations des
 * superviseurs, historique nominatif, comparaison de saisons.
 * Lignes allégées : colonnes affichées ou utilisées par les écrans seulement.
 */

/** Copie limitée aux colonnes listées (valeurs absentes ou null omises). */
function pick(row, columns) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  columns.forEach((col) => {
    if (row[col] !== undefined && row[col] !== null) out[col] = row[col];
  });
  return out;
}

/** Copie sans les valeurs null (lecture : null et absent sont équivalents). */
function dropNulls(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  Object.entries(row).forEach(([key, value]) => {
    if (value !== null && value !== undefined) out[key] = value;
  });
  return out;
}

/* ------------------------------ Saisons et accueil ------------------------------ */

/** Annuaire des saisons (id, nom, type, active) : saison active des écrans admin. */
export function cachedSeasonDirectory() {
  return cachedFetch("adm.seasons.directory", () => fetchSeasonDirectory());
}

/** Compteurs de l'accueil (membres, superviseurs, séances) : nombres seulement. */
export function cachedDashboardStats(saisonId) {
  return cachedFetch(`adm.dashboard.stats.${seg(saisonId)}`, () =>
    getSeasonDashboardStats(saisonId)
  );
}

export function cachedTestsCount(saisonId) {
  return cachedFetch(`adm.dashboard.testsCount.${seg(saisonId)}`, () =>
    countTestsAdmin(null, saisonId)
  );
}

/** Fil d'activité : id, titre et date des derniers tests (sans invitations). */
export function cachedRecentTests(saisonId, limit) {
  return cachedFetch(
    `adm.dashboard.recentTests.${seg(saisonId)}`,
    () => listRecentTestsAdmin(limit, saisonId),
    {
      toCache: (res) => ({
        ...res,
        tests: (res.tests || []).map((test) =>
          pick(test, ["id", "titre", "statut", "created_at", "saison_id"])
        ),
      }),
    }
  );
}

export function cachedRecentAlerts(saisonId, limit) {
  return cachedFetch(`adm.dashboard.recentAlerts.${seg(saisonId)}`, () =>
    listRecentAlertsAdmin(saisonId, limit)
  );
}

/** Badge du menu : tests encore planifiés. */
export function cachedPlannedTestsCount() {
  return cachedFetch("adm.tests.plannedCount", () => countPlannedTestsAdmin());
}

/* ------------------------------------ Membres ------------------------------------ */

/**
 * Liste des membres TELLE QU'AFFICHÉE (une ligne par membre, catégorie, séance,
 * superviseur et pourcentage déjà calculés), par saison active. Les tables
 * brutes (profils, inscriptions, progression complète, demandes activées) ne
 * sont jamais écrites : `fetchRows` (écran) les lit et renvoie
 * { ok, members, inscriptionsOk, progressOk, applicationsOk }.
 */
export function cachedAdminMembers(saisonId, fetchRows) {
  return cachedFetch(`adm.members.${seg(saisonId)}`, fetchRows, {
    toCache: (res) => ({ ...res, members: (res.members || []).map(dropNulls) }),
  });
}

/* ------------------------------------ Séances ------------------------------------ */

const SEANCE_COLUMNS = [
  "id",
  "nom",
  "jour",
  "genre",
  "heure_debut",
  "heure_fin",
  "superviseur_id",
  "saison_id",
  "statut",
];

/** Séance allégée ; inscriptions réduites aux acceptées (comptage des membres). */
function compactSeance(seance) {
  const out = pick(seance, SEANCE_COLUMNS);
  if (seance?.superviseur) {
    out.superviseur = pick(seance.superviseur, [
      "first_name",
      "last_name",
      "email",
      "canonical_email",
    ]);
  }
  if (Array.isArray(seance?.inscriptions)) {
    out.inscriptions = seance.inscriptions
      .filter((row) => row?.statut === "accepte")
      .map(() => ({ statut: "accepte" }));
  }
  return out;
}

/**
 * Séances de l'écran الحصص (lecture complète, inchangée en ligne). Cache : les
 * séances non archivées de la saison seulement, allégées.
 */
export function cachedSeasonSeances(saisonId) {
  return cachedFetch(`adm.seances.${seg(saisonId)}`, () => getAllSeances(), {
    toCache: (res) => ({
      ...res,
      seances: filterSeancesForSeason(res.seances || [], saisonId).map(compactSeance),
    }),
  });
}

/** Séances allégées d'une saison (écran المشرفون). */
export function cachedSeancesLite(saisonId) {
  return cachedFetch(`adm.seances.lite.${seg(saisonId)}`, () =>
    getAllSeances({ saisonId, lite: true })
  );
}

const SUPERVISOR_COLUMNS = [
  "id",
  "first_name",
  "last_name",
  "email",
  "canonical_email",
  "account_status",
  "avatar_url",
];

export function cachedAssignableSupervisors(saisonId) {
  return cachedFetch(
    `adm.supervisors.assignable.${seg(saisonId)}`,
    () => getAssignableSupervisors({ saisonId }),
    {
      toCache: (res) => ({
        ...res,
        supervisors: (res.supervisors || []).map((row) =>
          pick(row, [...SUPERVISOR_COLUMNS, "seanceId", "seanceNom"])
        ),
      }),
    }
  );
}

/** Membres d'une séance (détail admin) : colonnes affichées et passées à la fiche. */
export function cachedAdminSeanceMembers(seanceId) {
  return cachedFetch(`adm.seanceMembers.${seg(seanceId)}`, () => getSeanceMembers(seanceId), {
    toCache: (res) => ({
      ...res,
      members: (res.members || []).map((row) =>
        pick(row, [
          "userId",
          "nom",
          "prenom",
          "email",
          "avatarUrl",
          "telephone",
          "ecole",
          "niveau",
          "quantiteHifz",
          "genre",
        ])
      ),
    }),
  });
}

/** Aperçu de présence d'une séance : compteurs par date (sans membre). */
export function cachedSeancePresenceOverview(seanceId) {
  return cachedFetch(`adm.seance.${seg(seanceId)}.presenceOverview`, () =>
    getSeancePresenceOverview(seanceId)
  );
}

/* ---------------------------------- Superviseurs ---------------------------------- */

export function cachedSupervisorProfiles() {
  return cachedFetch("adm.supervisors.profiles", () => getSupervisorProfiles(), {
    toCache: (res) => ({
      ...res,
      supervisors: (res.supervisors || []).map((row) => pick(row, SUPERVISOR_COLUMNS)),
    }),
  });
}

function supervisorKey(supervisorId, resource) {
  return `adm.supervisor.${seg(supervisorId)}.${resource}`;
}

/** Profil affiché par la fiche superviseur. */
export function cachedAdminSupervisorProfile(supervisorId) {
  return cachedFetch(supervisorKey(supervisorId, "profile"), () => fetchProfile(supervisorId), {
    toCache: (res) => ({
      ...res,
      profile: pick(res.profile, [
        "id",
        "first_name",
        "last_name",
        "email",
        "canonical_email",
        "phone",
        "genre",
        "date_naissance",
        "account_status",
        "created_at",
        "updated_at",
        "avatar_url",
      ]),
    }),
  });
}

/**
 * Séances de la saison (fiche superviseur). Cache : celles du superviseur
 * seulement (la liste complète ne sert qu'à l'affectation, impossible hors ligne).
 */
export function cachedAdminSupervisorSeances(supervisorId, saisonId) {
  return cachedFetch(
    supervisorKey(supervisorId, `seances.${seg(saisonId)}`),
    () => getAllSeances({ saisonId }),
    {
      toCache: (res) => ({
        ...res,
        seances: (res.seances || [])
          .filter((s) => s.superviseur_id === supervisorId && s.statut !== "archivee")
          .map((s) => pick(s, SEANCE_COLUMNS)),
      }),
    }
  );
}

/**
 * Membres de la fiche superviseur : inscriptions acceptées de la saison et
 * profils des membres, lus ensemble. En ligne, chaque partie garde son propre
 * état (inscOk, memOk) comme avant. Cache : inscriptions des séances de ce
 * superviseur et profils de ces membres seulement, allégés.
 */
export function cachedAdminSupervisorMembers(supervisorId, saisonId) {
  return cachedFetch(
    supervisorKey(supervisorId, `members.${seg(saisonId)}`),
    async () => {
      const [inscRes, memRes] = await Promise.all([
        getAllAcceptedInscriptions({ saisonId }),
        getMemberProfiles(),
      ]);
      return {
        ok: !!(inscRes.ok && memRes.ok),
        error: inscRes.error || memRes.error,
        inscOk: !!inscRes.ok,
        memOk: !!memRes.ok,
        inscriptions: inscRes.ok ? inscRes.inscriptions || [] : [],
        members: memRes.ok ? memRes.members || [] : [],
      };
    },
    {
      toCache: (res) => {
        const inscriptions = (res.inscriptions || [])
          .filter((row) => row?.seance?.superviseur_id === supervisorId)
          .map((row) => ({
            ...pick(row, ["id", "membre_id", "seance_id", "saison_id", "date_inscription"]),
            seance: pick(row.seance, SEANCE_COLUMNS),
          }));
        const ids = new Set(inscriptions.map((row) => row.membre_id));
        const members = (res.members || [])
          .filter((profile) => ids.has(profile.id))
          .map((profile) =>
            pick(profile, [
              "id",
              "first_name",
              "last_name",
              "avatar_url",
              "email",
              "phone",
              "school",
              "level",
              "hifz_amount",
            ])
          );
        return { ...res, inscriptions, members };
      },
    }
  );
}

/* -------------------------------------- Tests -------------------------------------- */

/**
 * Invitations d'un test en cache : groupes [statut, date choisie, nombre]
 * (une invitation par membre de la saison ferait des centaines de lignes).
 */
function groupInvitations(invitations) {
  const groups = new Map();
  (invitations || []).forEach((row) => {
    const statut = row?.statut || null;
    const date = row?.date_choisie || null;
    const groupKey = `${statut}|${date}`;
    const group = groups.get(groupKey) || [statut, date, 0];
    group[2] += 1;
    groups.set(groupKey, group);
  });
  return [...groups.values()];
}

/** Lignes { statut, date_choisie } reconstruites (comptages des écrans). */
function expandInvitations(groups) {
  const rows = [];
  (groups || []).forEach(([statut, date, count]) => {
    for (let i = 0; i < count; i += 1) rows.push({ statut, date_choisie: date });
  });
  return rows;
}

/**
 * Tous les tests (liste et en-tête du détail). Invitations réduites à leur
 * statut et à la date choisie, comptées : sans membre ni note.
 */
export async function cachedAllTests() {
  const res = await cachedFetch("adm.tests.all", () => getAllTestsAdmin(), {
    toCache: (result) => ({
      ...result,
      tests: (result.tests || []).map((test) => ({
        ...pick(test, [
          "id",
          "titre",
          "type",
          "quran_quantity",
          "statut",
          "created_at",
          "saison_id",
        ]),
        saison: pick(test.saison, ["id", "name"]),
        test_dates: (test.test_dates || []).map((row) => pick(row, ["date_proposee"])),
        invitationGroups: groupInvitations(test.invitations),
      })),
    }),
  });
  if (!res.fromCache) return res;
  return {
    ...res,
    tests: (res.tests || []).map(({ invitationGroups, ...test }) => ({
      ...test,
      invitations: expandInvitations(invitationGroups),
    })),
  };
}

/** Dates proposées d'un test (date et heure, sans membre). */
export function cachedTestDates(testId) {
  return cachedFetch(`adm.test.${seg(testId)}.dates`, () => getTestDates(testId));
}

/* ------------------------------------- Alertes ------------------------------------- */

/** L'écran affiche tout en ligne ; le cache garde les 50 alertes les plus récentes. */
const ALERTS_HISTORY_CACHE_MAX = 50;

/** Historique des alertes de la saison (nombre de lectures, sans nom). */
export function cachedAlertsHistory(saisonId) {
  return cachedFetch(
    `adm.alerts.history.${seg(saisonId)}`,
    () => getAllAlertsAdmin({ saisonId }),
    {
      toCache: (res) => ({
        ...res,
        alerts: (res.alerts || []).slice(0, ALERTS_HISTORY_CACHE_MAX),
      }),
    }
  );
}

/* -------------------- Fiche d'un membre (vue admin) : adm.member.<id>.* -------------------- */
// Séance, champs, position, objectif, présence et rythme : supervisorOfflineReads
// avec rolePrefix "adm". Les notes de tests et l'historique des saisons restent hors cache.

/** Saison où l'admin peut affecter le membre (demande acceptée). */
export function cachedAdminMemberAssignmentSeason(memberId) {
  return cachedFetch(`adm.member.${seg(memberId)}.assignmentSeason`, () =>
    findAdminSeanceAssignmentSeason(memberId)
  );
}

/** Rôles du compte (bouton « حذف الحساب » réservé aux comptes membres). */
export function cachedAdminMemberRoles(memberId) {
  return cachedFetch(`adm.member.${seg(memberId)}.roles`, () => getProfileRoles(memberId), {
    toCache: (res) => pick(res, ["ok", "role", "roles"]),
  });
}
