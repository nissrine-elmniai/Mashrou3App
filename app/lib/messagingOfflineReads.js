import { cachedFetch, cacheKeySegment as seg } from "./offlineCache";
import {
  formatRelativeTime,
  getConversation,
  getInboxThreads,
  getMyAcceptedSeance,
  listAdminProfiles,
  resolveAdminProfile,
} from "./messagesApi";
import {
  getChatGroup,
  getGroupMembers,
  getGroupMessages,
  getMyChatGroups,
} from "./chatGroupsApi";
import {
  countUnreadNotifications,
  getNotificationPreferences,
  listMyNotifications,
} from "./notificationsApi";
import { getVisibleAlertsWithAckStatus } from "./alertsApi";
import { getAdminChatSupervisors } from "./seancesApi";
import { cachedSupervisorSeances } from "./supervisorOfflineReads";

/**
 * Lectures de la MESSAGERIE et des NOTIFICATIONS, servies par cachedFetch.
 * Préfixe common. : données du compte, identiques quel que soit le rôle affiché
 * (fils, groupes, conversations, notifications). Préfixe du rôle quand la
 * lecture en dépend (alertes, contacts du superviseur, de l'admin, du membre).
 * Le temps réel (Realtime) n'est jamais mis en cache.
 */

/** Fils affichés au plus (les plus récents) : seuls ceux-là sont gardés en cache. */
const THREADS_CACHE_MAX = 50;
/** Messages gardés en cache par conversation ou groupe (les plus récents). */
const MESSAGES_CACHE_MAX = 30;

function keepRecentMessages(result) {
  const messages = Array.isArray(result?.messages) ? result.messages : [];
  // Ordre croissant (du plus ancien au plus récent) : on garde la fin.
  return { ...result, messages: messages.slice(-MESSAGES_CACHE_MAX) };
}

/**
 * Fils de la boîte de réception. La variante includeStatus (rôles et statut des
 * correspondants) est réservée à l'admin : préfixe adm., purgé avec le rôle.
 */
export function cachedInboxThreads({ includeStatus = false } = {}) {
  const resource = includeStatus ? "adm.inbox.threads" : "common.inbox.threads";
  return cachedFetch(resource, () => getInboxThreads({ includeStatus }), {
    toCache: (result) => ({
      ...result,
      threads: (result?.threads || []).slice(0, THREADS_CACHE_MAX),
    }),
  });
}

/** Groupes du compte. Servis du cache : heure relative recalculée. */
export async function cachedChatGroups() {
  const res = await cachedFetch("common.chatGroups", () => getMyChatGroups());
  if (res.fromCache) {
    return {
      ...res,
      groups: (res.groups || []).map((g) => ({
        ...g,
        time: formatRelativeTime(g.lastAt || null),
      })),
    };
  }
  return res;
}

/** Nombre de notifications non lues (badge). */
export function cachedUnreadNotificationsCount() {
  return cachedFetch("common.notifications.unreadCount", () =>
    countUnreadNotifications()
  );
}

/** Conversation 1-à-1 : l'écran reçoit tout en ligne, le cache garde les 30 derniers. */
export function cachedConversation(otherUserId, seanceId = null) {
  return cachedFetch(
    `common.conversation.${seg(otherUserId)}.${seanceId ? seg(seanceId) : "all"}`,
    () => getConversation({ otherUserId, seanceId }),
    { toCache: keepRecentMessages }
  );
}

/** Messages d'un groupe (ordre croissant) : 30 derniers en cache. */
export function cachedGroupMessages(groupId) {
  return cachedFetch(
    `common.group.${seg(groupId)}.messages`,
    () => getGroupMessages(groupId),
    { toCache: keepRecentMessages }
  );
}

/** Nom, avatar et rôle dans le groupe. */
export function cachedChatGroup(groupId) {
  return cachedFetch(`common.group.${seg(groupId)}.info`, () => getChatGroup(groupId));
}

export function cachedGroupMembers(groupId) {
  return cachedFetch(`common.group.${seg(groupId)}.members`, () =>
    getGroupMembers(groupId)
  );
}

/** Première page des notifications non lues (les pages suivantes ne sont pas en cache). */
export function cachedNotificationsFirstPage() {
  return cachedFetch("common.notifications.page1", () =>
    listMyNotifications({ offset: 0 })
  );
}

export function cachedNotificationPreferences() {
  return cachedFetch("common.notifications.prefs", () => getNotificationPreferences());
}

const ALERT_ROLE_PREFIX = { member: "mem", supervisor: "sup" };

/** Alertes avec état d'accusé (boîte unifiée), par rôle et par saison. */
export function cachedAlertsWithAck(role, saisonId) {
  const prefix = ALERT_ROLE_PREFIX[role];
  const fetcher = () =>
    getVisibleAlertsWithAckStatus({
      scopeToCurrentSeason: true,
      // null → alertsApi résout la saison active en DB
      saisonId,
      role,
    });
  if (!prefix) return fetcher();
  return cachedFetch(`${prefix}.alerts.withAck.${seg(saisonId)}`, fetcher);
}

/* ---- Contacts selon le rôle ---- */

/** Superviseur : comptes admin (section épinglée de la boîte). */
export function cachedAdminProfiles() {
  return cachedFetch("sup.chat.admins", () => listAdminProfiles());
}

/** Superviseur : compte admin de référence (conversation « الإدارة »). */
export function cachedAdminProfile() {
  return cachedFetch("sup.chat.adminProfile", () => resolveAdminProfile());
}

/**
 * Superviseur : séance active (ou celle demandée). Même sélection que
 * getSupervisorActiveSeance, sur la clé sup.seances.active du lot 3.
 */
export async function cachedSupervisorActiveSeance(authId, seanceId = null) {
  const res = await cachedSupervisorSeances(authId);
  if (!res.ok) return { ...res, seance: null, seances: [] };
  const seances = res.seances || [];
  const seance = seanceId
    ? seances.find((s) => s.id === seanceId) || null
    : seances[0] || null;
  return { ...res, seance, seances };
}

/** Membre : séance acceptée liée au superviseur de la conversation. */
export function cachedMyAcceptedSeance({ seanceId = null, superviseurId = null } = {}) {
  return cachedFetch(
    `mem.chat.acceptedSeance.${seg(seanceId)}.${seg(superviseurId)}`,
    () => getMyAcceptedSeance({ seanceId, superviseurId })
  );
}

/** Admin : superviseurs de la liste de chat, par saison. */
export function cachedAdminChatSupervisors(saisonId) {
  return cachedFetch(`adm.chat.supervisors.${seg(saisonId)}`, () =>
    getAdminChatSupervisors({ saisonId })
  );
}
