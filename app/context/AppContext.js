import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, AppState, View, StyleSheet } from "react-native";
import { emptyState, bootstrapUsers, bootstrapSeasons } from "../data/seed";
import {
  loadAppState,
  saveAppState,
  clearAppState,
  isAppStateOwnedBy,
} from "../data/storage";
import { supabase } from "../lib/supabase";
import {
  flushMemberProgressDelta,
  resetMemberProgressState,
} from "../lib/progressApi";
import { isOffline, onBackOnline, probeServer } from "../lib/networkState";
import {
  purgeAllOfflineCache,
  readCache,
  readLastAuthId,
  writeCache,
  writeLastAuthId,
} from "../lib/offlineCache";
import {
  readStoredSessionUserId,
  setCurrentAuthIdHint,
} from "../lib/currentAuth";
import {
  isPasswordTooShort,
  passwordTooShortMessage,
} from "../constants/security";
import {
  ACCOUNT_STATUS,
  DASHBOARD_BY_ROLE,
  REGISTRATION_KIND,
  REGISTRATION_STATUS,
  ROLES,
  SEASON_TYPES,
  getRegistrationKind,
  normalizeRoles,
  resolveSessionRole,
  userHasRole,
  withMergedRoles,
} from "../constants/roles";
import {
  NOTIF_CATEGORY,
  inferNotificationCategory,
} from "../constants/notifications";
import { colors } from "../constants/theme";
import {
  isSupabaseConfigured,
  signInWithEmailPassword,
  verifyCurrentPassword,
  signUpWithProfile,
  signOutAuth,
  clearLocalAuthSession,
  requestPasswordReset,
  isPasswordRecoveryInProgress,
  discardPersistedPasswordRecovery,
  getCurrentAuthSession,
  fetchProfile,
  profileToAppUser,
  normalizeAppRole,
} from "../lib/auth";
import {
  upsertMemberApplication,
  insertPendingMemberApplication,
  listMemberApplications,
  findOpenSeasonRenewal,
} from "../lib/memberApplicationsApi";
import { updateMemberInfo } from "../lib/membersApi";
import {
  fetchSaisons,
  parseSeasonStartDate,
  startNewSeasonRpc,
  syncSeasonsWithSupabase,
} from "../lib/saisonsApi";
import { getActiveRegularSeason, isSeasonRegistrationAvailable } from "../lib/seasonScope";
import { getPendingSupervisorInvitation, deleteSupervisorAccount } from "../lib/supervisorInvitationsApi";
import { canonicalEmail } from "../lib/authEmail";

/** ISO YYYY-MM-DD pour colonnes Postgres `date`. Accepte aussi YYYY/MM/DD (placeholders admin). Pas de parse JJ/MM/AAAA. */
function toIsoDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashIso = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashIso) {
    return `${slashIso[1]}-${slashIso[2].padStart(2, "0")}-${slashIso[3].padStart(2, "0")}`;
  }
  return raw;
}

function withIsoSeasonDates(season) {
  if (!season) return season;
  return {
    ...season,
    startDate: toIsoDateOnly(season.startDate) || season.startDate || null,
    endDate: toIsoDateOnly(season.endDate) || season.endDate || null,
  };
}
import {
  clampTumuns,
  enrichMemberProgram,
  percentToTumuns,
} from "../lib/tumun";
import {
  deleteMemberProgramRemote,
  normalizeProgramType,
  syncMemberProgramsWithSupabase,
  upsertMemberProgram,
} from "../lib/memberProgramsApi";

const AppContext = createContext(null);

/** Attente maximale de l'envoi des ± ثمن en attente avant la déconnexion. */
const LOGOUT_FLUSH_TIMEOUT_MS = 3000;

/**
 * Intervalle minimal entre deux essais AUTOMATIQUES de synchro des programmes
 * (changement de saisons, retour au premier plan). Sans sonde réseau (lot 1),
 * un échec réseau ne se distingue pas d'un refus RLS / trigger : on borne tout.
 */
const PROGRAMS_AUTO_RETRY_MS = 30000;

/** Vérification serveur de la session au retour au premier plan : au plus toutes les 5 min. */
const SESSION_VALIDATE_MIN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Nouvel essai de restauration en ligne quand getSession() renvoie encore
 * l'échec de rafraîchissement mémorisé par auth-js (REFRESH_FAILURE_COOLDOWN_MS = 60 s).
 */
const ONLINE_RESTORE_RETRY_MS = 65000;

/** Profil hors ligne : cache:v1:<authId>:common.profile. */
const PROFILE_CACHE_RESOURCE = "common.profile";

/** Profil lu avec succès sur le serveur : copie pour la restauration hors ligne. */
async function rememberServerProfile(profile) {
  if (!profile?.id) return;
  await writeCache(profile.id, PROFILE_CACHE_RESOURCE, profile);
  await writeLastAuthId(profile.id);
}

let lastSessionValidationAt = 0;

/**
 * Vérification serveur de la session (un seul getUser()). Un refus serveur
 * (session_not_found) fait supprimer la session par auth-js : SIGNED_OUT,
 * puis purge. Un échec réseau est ignoré (auth-js garde la session).
 * Sans session ouverte, l'appel ne vérifie rien : ne l'appeler qu'avec une session.
 */
function validateSessionWithServer({ force = false } = {}) {
  if (!isSupabaseConfigured() || isOffline()) return;
  const now = Date.now();
  if (!force && now - lastSessionValidationAt < SESSION_VALIDATE_MIN_INTERVAL_MS) return;
  lastSessionValidationAt = now;
  supabase.auth.getUser().catch((e) => {
    console.warn("[auth] validation session:", e?.message || e);
  });
}

const uid = (prefix) =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

/**
 * Id d'un nouveau programme, généré une fois à l'ouverture du formulaire :
 * un nouvel envoi du même formulaire réécrit la même ligne (upsert sur id).
 */
export const newMemberProgramId = () => uid("mp");

/** Première occurrence par `id` — évite seed + cache / double append. */
function uniqSeasonsById(list = []) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((season) => {
    const id = season?.id;
    if (id != null && String(id) !== "") {
      const key = String(id);
      if (seen.has(key)) return;
      seen.add(key);
    }
    out.push(season);
  });
  return out;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "/");
}

/** Migre les programmes locaux hérités (progression %) vers completedTumuns. */
function migrateMemberPrograms(programs = []) {
  return programs.map((p) => {
    const nbHizb = Number(p.nbHizb) || 0;
    const completedTumuns =
      p.completedTumuns != null
        ? clampTumuns(p.completedTumuns, nbHizb)
        : percentToTumuns(p.progression, nbHizb);
    const { progression: _legacy, ...rest } = p;
    return {
      ...rest,
      completedTumuns,
      type: normalizeProgramType(p.type),
    };
  });
}

function inviteToken() {
  return `INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

/**
 * Rôles de routing = rôles du profil lu sur le serveur, sans fusion avec le cache
 * local. Même règle que private.profile_roles_array (migration 0026) :
 * roles[] s'il est non vide, sinon role, sinon member.
 */
function rolesFromServerProfile(profile) {
  const source =
    Array.isArray(profile?.roles) && profile.roles.length > 0
      ? profile.roles
      : [profile?.role];
  const roles = new Set();
  source.forEach((r) => {
    const n = normalizeAppRole(r);
    if (n) roles.add(n);
  });
  if (roles.size === 0) roles.add(ROLES.MEMBER);
  return [...roles];
}

/** Applique le rôle de routing (session) sur un utilisateur issu du profil Supabase. */
function applySupabaseSessionRole(appUser, profile, preferredRole) {
  const rolesForRouting = rolesFromServerProfile(profile);
  // role: null : sinon normalizeRoles réintroduirait profiles.role absent de roles[].
  const sessionRole = resolveSessionRole(
    { ...appUser, role: null, roles: rolesForRouting },
    preferredRole
  );
  return {
    ...appUser,
    role: sessionRole,
    roles: rolesForRouting,
  };
}

/**
 * Démarrage hors ligne : utilisateur reconstruit depuis le profil en cache,
 * seulement si TOUTES les conditions sont vraies :
 * - une session est stockée (jeton expiré accepté), d'id sessionAuthId ;
 * - cet id est égal à cache:v1:lastAuthId ;
 * - un profil en cache existe pour cet id, avec account_status actif.
 * Rôles du profil en cache : valables hors ligne seulement, le serveur
 * les remplace à la restauration en ligne.
 * @returns {Promise<object|null>}
 */
async function restoreFromOfflineCache(sessionAuthId, knownUsers) {
  if (!sessionAuthId) return null;
  if ((await readLastAuthId()) !== sessionAuthId) return null;
  const cached = await readCache(sessionAuthId, PROFILE_CACHE_RESOURCE);
  const profile = cached?.data;
  if (!profile || profile.id !== sessionAuthId) return null;
  if (profile.account_status !== ACCOUNT_STATUS.ACTIVE) return null;
  const local = (knownUsers || []).find((u) => u.authId === profile.id) || null;
  const base = profileToAppUser(profile, local || {});
  if (local) base.id = local.id;
  return applySupabaseSessionRole(base, profile, null);
}

function maybeRegisterSessionPush(userId, { requestPermission = false } = {}) {
  if (!userId) return;
  import("../lib/pushNotifications")
    .then(({ registerForPushNotifications }) =>
      registerForPushNotifications(userId, { requestPermission })
    )
    .catch((e) => {
      console.warn("[push] maybeRegisterSessionPush:", e?.message || e);
    });
}

export function AppProvider({ children }) {
  const [hydrated, setHydrated] = useState(false);
  const [users, setUsers] = useState(emptyState.users);
  const [seasons, setSeasons] = useState(
    isSupabaseConfigured() ? [] : emptyState.seasons
  );
  const [registrations, setRegistrations] = useState(emptyState.registrations);
  const [groups, setGroups] = useState(emptyState.groups);
  const [progress, setProgress] = useState(emptyState.progress);
  const [attendance, setAttendance] = useState(emptyState.attendance);
  const [exams, setExams] = useState(emptyState.exams);
  const [notifications, setNotifications] = useState(emptyState.notifications);
  const [memberPrograms, setMemberPrograms] = useState(
    emptyState.memberPrograms || []
  );
  const [currentUser, setCurrentUser] = useState(null);
  /** Session Supabase Auth, alimentée en best-effort par login() quand le compte est
   *  aussi seedé côté Supabase. null tant qu'aucun lien n'a réussi — ne conditionne
   *  jamais le login mock existant. */
  const [supabaseSession, setSupabaseSession] = useState(null);
  const skipNextSave = useRef(true);
  /** authId du compte à qui appartiennent les données en mémoire (écrit dans app_state_v3). */
  const ownerAuthIdRef = useRef(null);
  const programsSyncedRef = useRef(false);
  const applicationsSyncedRef = useRef(false);
  const memberApplicationsSyncedRef = useRef(null);
  /** Incrémenté pour relancer la synchro des programmes après un échec. */
  const [programsSyncTick, setProgramsSyncTick] = useState(0);
  /** Date (ms) de la dernière requête de synchro des programmes, 0 = aucune. */
  const programsLastAttemptRef = useRef(0);
  /** true : le prochain essai vient de l'ouverture de l'onglet (hors limite des 30 s). */
  const programsManualRetryRef = useRef(false);
  /** Déconnexion en cours (flush ± ثمن, push, purge) : une seule à la fois. */
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutTaskRef = useRef(null);
  /**
   * Utilisateur restauré depuis le cache au démarrage hors ligne (lecture seule).
   * Remis à false par la restauration en ligne, la connexion ou la purge.
   */
  const [offlineRestored, setOfflineRestored] = useState(false);
  const offlineRestoredRef = useRef(false);
  /** Démarrage hors ligne sans restauration : id de la session alors constatée. */
  const bootOfflineSessionIdRef = useRef(null);
  const loginInProgressRef = useRef(false);
  const onlineRestoreInFlightRef = useRef(false);
  const onlineRestoreRetryTimerRef = useRef(null);
  // Valeurs courantes pour les écouteurs réseau (évite les fermetures périmées).
  const currentUserRef = useRef(null);
  currentUserRef.current = currentUser;
  const usersRef = useRef([]);
  usersRef.current = users;
  const supabaseSessionIdRef = useRef(null);
  supabaseSessionIdRef.current = supabaseSession?.user?.id || null;

  const markOfflineRestored = useCallback((value) => {
    offlineRestoredRef.current = value;
    setOfflineRestored(value);
  }, []);

  /**
   * Vide l'état lié au compte, app_state_v3 et la file ± ثمن de progressApi.
   * Idempotente : logout() l'appelle, puis l'événement SIGNED_OUT la rappelle.
   * seasons est conservé (données publiques, non liées au compte).
   */
  const purgeSessionState = useCallback(async () => {
    skipNextSave.current = true;
    ownerAuthIdRef.current = null;
    setCurrentAuthIdHint(null);
    markOfflineRestored(false);
    bootOfflineSessionIdRef.current = null;
    clearTimeout(onlineRestoreRetryTimerRef.current);
    onlineRestoreRetryTimerRef.current = null;
    programsSyncedRef.current = false;
    programsLastAttemptRef.current = 0;
    programsManualRetryRef.current = false;
    applicationsSyncedRef.current = false;
    memberApplicationsSyncedRef.current = null;
    setCurrentUser(null);
    setSupabaseSession(null);
    setUsers([]);
    setRegistrations([]);
    setGroups([]);
    setProgress([]);
    setAttendance([]);
    setExams([]);
    setNotifications([]);
    setMemberPrograms([]);
    resetMemberProgressState();
    // Tout le cache hors ligne (pointeur lastAuthId compris), pas seulement le
    // propriétaire : ownerAuthIdRef peut être null quand l'hydratation a écarté le cache.
    await Promise.all([clearAppState(), purgeAllOfflineCache()]);
  }, [markOfflineRestored]);

  // Déconnexion décidée par le serveur (session révoquée, refresh token refusé).
  // Un échec réseau du rafraîchissement n'émet pas SIGNED_OUT (auth-js garde la session).
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      // Rien d'attendu dans le callback (verrou Auth) : purge différée.
      setTimeout(() => {
        purgeSessionState().catch((e) => {
          console.warn("[auth] purge SIGNED_OUT:", e?.message || e);
        });
      }, 0);
    });
    return () => data?.subscription?.unsubscribe();
  }, [purgeSessionState]);

  /**
   * Ouverture de l'onglet programmes : un essai, même dans les 30 s suivant
   * le précédent, si la dernière synchro n'a pas abouti.
   */
  const retryMemberProgramsSync = useCallback(() => {
    if (programsSyncedRef.current) return;
    programsManualRetryRef.current = true;
    setProgramsSyncTick((n) => n + 1);
  }, []);

  // Retour au premier plan : essai automatique (soumis à la limite des 30 s).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" || programsSyncedRef.current) return;
      setProgramsSyncTick((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      const remoteMode = isSupabaseConfigured();
      // Sonde d'abord (4 s max), en parallèle de la lecture d'app_state_v3.
      // Hors ligne : aucune lecture réseau (fetchSaisons, fetchProfile).
      const [saved, reachable] = await Promise.all([
        loadAppState(),
        remoteMode ? probeServer() : Promise.resolve(true),
      ]);
      const bootOffline = remoteMode && !reachable;
      let loadedUsers = remoteMode ? [] : bootstrapUsers;
      let loadedSeasons = remoteMode ? [] : bootstrapSeasons;
      // Données liées au compte : appliquées après lecture de la session,
      // une fois le propriétaire du cache vérifié.
      let ownedState = null;
      if (saved) {
        loadedUsers =
          Array.isArray(saved.users) && saved.users.length > 0
            ? remoteMode
              ? saved.users
                  .filter((u) => u.authId)
                  .map((u) => ({ ...u, password: null }))
              : saved.users
            : loadedUsers;
        loadedSeasons =
          Array.isArray(saved.seasons) && saved.seasons.length > 0
            ? saved.seasons
            : remoteMode
              ? []
              : bootstrapSeasons;
        setSeasons(uniqSeasonsById(loadedSeasons));
        setGroups(remoteMode ? [] : saved.groups || []);
        setProgress(remoteMode ? [] : saved.progress || []);
        setAttendance(remoteMode ? [] : saved.attendance || []);
        setExams(remoteMode ? [] : saved.exams || []);
        ownedState = {
          registrations: saved.registrations || [],
          notifications: saved.notifications || [],
          memberPrograms: migrateMemberPrograms(
            saved.memberPrograms || emptyState.memberPrograms || []
          ),
        };
      } else {
        setUsers(loadedUsers);
        setSeasons(uniqSeasonsById(loadedSeasons));
        if (remoteMode) {
          setGroups([]);
          setProgress([]);
          setAttendance([]);
          setExams([]);
        }
        setMemberPrograms(
          remoteMode
            ? []
            : migrateMemberPrograms(emptyState.memberPrograms || [])
        );
      }

      let seasonsFromServer = false;
      if (isSupabaseConfigured() && !bootOffline) {
        const seasonSync = await syncSeasonsWithSupabase(
          (loadedSeasons || []).map(withIsoSeasonDates)
        );
        if (seasonSync.ok && Array.isArray(seasonSync.seasons)) {
          setSeasons(uniqSeasonsById(seasonSync.seasons));
          seasonsFromServer = true;
        }
      }

      let restored = null;
      let cacheDiscarded = false;
      let bootPath = "login";
      if (isSupabaseConfigured()) {
        // Avant toute restauration : une clé de récupération = signOut et login.
        // Hors ligne, le signOut est reporté au prochain démarrage en ligne.
        const interruptedRecovery = await discardPersistedPasswordRecovery({
          offline: bootOffline,
        });
        let sessionResult = { session: null };
        let sessionAuthId = null;
        if (!interruptedRecovery) {
          if (bootOffline) {
            // Aucune méthode supabase.auth hors ligne : getSession() attend
            // l'initialisation d'auth-js (~30 s de nouvelles tentatives si le
            // jeton est expiré). Lecture directe de la session stockée.
            sessionAuthId = await readStoredSessionUserId();
          } else {
            sessionResult = await getCurrentAuthSession();
            sessionAuthId = sessionResult.session?.user?.id || null;
          }
        }
        if (saved) {
          // Ancien format (sans ownerAuthId) ou cache d'un autre compte que la
          // session : users, demandes, programmes, notifications et rôles du
          // cache sont ignorés. Sans session, login() tranchera.
          const owned = sessionAuthId
            ? isAppStateOwnedBy(saved, sessionAuthId)
            : !!saved.ownerAuthId;
          if (!owned) {
            loadedUsers = [];
            ownedState = {
              registrations: [],
              notifications: [],
              memberPrograms: [],
            };
            cacheDiscarded = true;
          }
          ownerAuthIdRef.current = owned ? saved.ownerAuthId : sessionAuthId;
        } else {
          ownerAuthIdRef.current = sessionAuthId;
        }
        // Récupération OTP : ne pas hydrater l'utilisateur depuis cette session.
        if (bootOffline && sessionAuthId && !isPasswordRecoveryInProgress()) {
          restored = await restoreFromOfflineCache(sessionAuthId, loadedUsers);
          if (restored) {
            bootPath = "offline";
            markOfflineRestored(true);
          } else {
            // Écran de connexion ; restauration automatique au retour du réseau.
            bootOfflineSessionIdRef.current = sessionAuthId;
          }
        } else if (sessionResult.session?.user && !isPasswordRecoveryInProgress()) {
          const profileResult = await fetchProfile(sessionResult.session.user.id);
          if (profileResult.ok) {
            const status = profileResult.profile.account_status;
            if (status === ACCOUNT_STATUS.INACTIVE) {
              await signOutAuth();
              setSupabaseSession(null);
            } else {
              const mail = profileResult.profile.email?.toLowerCase();
              const local =
                loadedUsers.find((u) => u.email?.toLowerCase() === mail) ||
                loadedUsers.find((u) => u.authId === profileResult.profile.id);
              const restoredBase = profileToAppUser(
                profileResult.profile,
                local || {}
              );
              if (local) restoredBase.id = local.id;
              restored = applySupabaseSessionRole(
                restoredBase,
                profileResult.profile,
                null
              );
              setSupabaseSession(sessionResult.session);
              maybeRegisterSessionPush(profileResult.profile.id, {
                requestPermission: false,
              });
              rememberServerProfile(profileResult.profile);
              validateSessionWithServer({ force: true });
              bootPath = "online";
            }
          }
        }
        // Admin : les demandes ne sont jamais reprises du disque (ancien cache
        // compris) ; elles sont rechargées depuis le serveur.
        if (
          restored &&
          userHasRole(restored, ROLES.ADMIN) &&
          ownedState?.registrations?.length
        ) {
          ownedState = { ...ownedState, registrations: [] };
          cacheDiscarded = true;
        }
      } else if (saved?.currentUserId) {
        restored = loadedUsers.find((u) => u.id === saved.currentUserId) || null;
      }

      if (ownedState) {
        setUsers(loadedUsers);
        setRegistrations(ownedState.registrations);
        setNotifications(ownedState.notifications);
        setMemberPrograms(ownedState.memberPrograms);
      }
      if (restored) {
        setCurrentAuthIdHint(restored.authId || null);
        setCurrentUser(restored);
      }
      if (__DEV__ && remoteMode) {
        console.log(`[boot] restauration : ${bootPath}`);
      }
      // Réponse serveur : le prochain save écrase AsyncStorage (liste vide comprise).
      // Cache ignoré (autre compte, demandes admin) : réécrit sans ces données.
      // Sinon on ne réécrit pas le cache déjà chargé.
      skipNextSave.current = !seasonsFromServer && !cacheDiscarded;
      setHydrated(true);
    })();
  }, []);

  // authId tenu par AppContext pour getCurrentAuthId() (clés de cache, filtres client).
  useEffect(() => {
    setCurrentAuthIdHint(currentUser?.authId || null);
  }, [currentUser?.authId]);

  const scheduleOnlineRestoreRetry = () => {
    if (onlineRestoreRetryTimerRef.current) return;
    onlineRestoreRetryTimerRef.current = setTimeout(() => {
      onlineRestoreRetryTimerRef.current = null;
      restoreOnlineRef.current();
    }, ONLINE_RESTORE_RETRY_MS);
  };

  /**
   * Retour en ligne : restauration normale, le serveur est prioritaire.
   * - Utilisateur restauré hors ligne : session et profil relus sur le serveur.
   * - Écran de connexion après un démarrage hors ligne : restauration seulement
   *   si aucune connexion ni déconnexion n'est en cours, et si la session locale
   *   est toujours celle constatée au démarrage.
   * Refus serveur (compte désactivé, session invalide, profil absent) :
   * purge, puis écran de connexion. Échec réseau : on reste en lecture seule.
   */
  const restoreOnline = async () => {
    const restoringOffline = offlineRestoredRef.current;
    const bootSessionId = bootOfflineSessionIdRef.current;
    if (!restoringOffline && !bootSessionId) return;
    if (onlineRestoreInFlightRef.current || logoutTaskRef.current) return;
    const loginScreenBlocked = () =>
      !restoringOffline &&
      (loginInProgressRef.current || !!logoutTaskRef.current || !!currentUserRef.current);
    if (loginScreenBlocked()) return;

    onlineRestoreInFlightRef.current = true;
    try {
      const expectedId = restoringOffline
        ? currentUserRef.current?.authId || null
        : bootSessionId;
      const storedId = await readStoredSessionUserId();
      if (!expectedId || storedId !== expectedId) {
        // Session disparue ou remplacée : plus rien à restaurer.
        if (restoringOffline) await purgeSessionState();
        else bootOfflineSessionIdRef.current = null;
        return;
      }

      const sessionResult = await getCurrentAuthSession();
      const session = sessionResult.session;
      if (!session?.user) {
        // Refus serveur : auth-js a supprimé la session → SIGNED_OUT → purge.
        // Sinon : échec de rafraîchissement mémorisé 60 s par auth-js, nouvel essai.
        if ((await readStoredSessionUserId()) === expectedId) {
          scheduleOnlineRestoreRetry();
        }
        return;
      }
      if (session.user.id !== expectedId || loginScreenBlocked()) {
        if (restoringOffline && session.user.id !== expectedId) {
          await purgeSessionState();
        }
        return;
      }

      const profileResult = await fetchProfile(expectedId);
      if (!profileResult.ok) {
        if (profileResult.notFound) {
          // Profil absent côté serveur : refus, chemin normal.
          await purgeSessionState();
          await signOutAuth();
        } else if (!isOffline()) {
          scheduleOnlineRestoreRetry();
        }
        return;
      }
      const profile = profileResult.profile;
      if (profile.account_status === ACCOUNT_STATUS.INACTIVE) {
        // Compte désactivé : SIGNED_OUT déclenche aussi la purge (idempotente).
        await purgeSessionState();
        await signOutAuth();
        return;
      }
      if (loginScreenBlocked()) return;

      const known = usersRef.current || [];
      const local =
        known.find((u) => u.authId === profile.id) ||
        (restoringOffline ? currentUserRef.current : null);
      const appUser = profileToAppUser(profile, local || {});
      if (local?.id) appUser.id = local.id;
      // Rôles du serveur ; on garde la pile affichée si le rôle existe encore.
      const sessionUser = applySupabaseSessionRole(
        appUser,
        profile,
        restoringOffline ? currentUserRef.current?.role : null
      );
      ownerAuthIdRef.current = profile.id;
      setCurrentAuthIdHint(profile.id);
      bootOfflineSessionIdRef.current = null;
      markOfflineRestored(false);
      setSupabaseSession(session);
      setCurrentUser(sessionUser);
      rememberServerProfile(profile);
      maybeRegisterSessionPush(profile.id, { requestPermission: false });
      validateSessionWithServer({ force: true });
      if (__DEV__) console.log("[boot] restauration : online (retour réseau)");

      const seasonSync = await syncSeasonsWithSupabase([]);
      if (seasonSync.ok && seasonSync.source === "remote") {
        setSeasons(uniqSeasonsById(seasonSync.seasons));
      }
    } catch (e) {
      console.warn("[boot] restauration en ligne:", e?.message || e);
    } finally {
      onlineRestoreInFlightRef.current = false;
    }
  };
  const restoreOnlineRef = useRef(restoreOnline);
  restoreOnlineRef.current = restoreOnline;

  // Retour en ligne (sonde) : restauration normale.
  useEffect(
    () =>
      onBackOnline(() => {
        restoreOnlineRef.current();
      }),
    []
  );

  // Premier plan : vérification serveur de la session, au plus toutes les 5 min.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      if (!supabaseSessionIdRef.current) return;
      validateSessionWithServer();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    // Admin : demandes gardées en mémoire seulement (téléphones, form_answers).
    // L'écran des demandes masque la liste si le chargement échoue : rien à servir hors ligne.
    const isAdminSession =
      !!currentUser && userHasRole(currentUser, ROLES.ADMIN);
    saveAppState({
      ownerAuthId: ownerAuthIdRef.current,
      users: isSupabaseConfigured()
        ? users.map((u) => ({ ...u, password: null }))
        : users,
      seasons,
      registrations: isAdminSession ? [] : registrations,
      groups,
      progress,
      attendance,
      exams,
      notifications,
      memberPrograms,
      currentUserId: currentUser?.id || null,
    });
  }, [
    hydrated,
    users,
    seasons,
    registrations,
    groups,
    progress,
    attendance,
    exams,
    notifications,
    memberPrograms,
    currentUser,
  ]);

  // Synchroniser les champs mock (nom, groupe…) sans écraser le rôle de routing
  // fixé par Supabase — bug : setCurrentUser(fresh) remettait role='member' quand
  // profiles.role était erroné mais la fiche seed locale avait le bon rôle.
  useEffect(() => {
    if (!currentUser || supabaseSession?.user?.id) return;
    const fresh = users.find((u) => u.id === currentUser.id);
    if (fresh && fresh !== currentUser) setCurrentUser(fresh);
  }, [users, currentUser, supabaseSession]);

  useEffect(() => {
    if (!supabaseSession?.user?.id) {
      programsSyncedRef.current = false;
      programsLastAttemptRef.current = 0;
      applicationsSyncedRef.current = false;
      memberApplicationsSyncedRef.current = null;
    }
  }, [supabaseSession?.user?.id]);

  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured() || !supabaseSession?.user?.id) return;
    if (programsSyncedRef.current) return;
    const authId = supabaseSession.user.id;
    const localUserId = currentUser?.id;
    if (!localUserId) return;
    const saisonId = getActiveRegularSeason(seasons)?.id || null;
    // Saison inconnue : aucune requête, cache conservé ; l'arrivée des saisons relancera.
    if (!saisonId) return;

    // Ouverture de l'onglet : toujours un essai. Déclencheurs automatiques
    // (saisons, premier plan) : au plus un toutes les PROGRAMS_AUTO_RETRY_MS.
    const manual = programsManualRetryRef.current;
    programsManualRetryRef.current = false;
    const sinceLast = Date.now() - programsLastAttemptRef.current;
    if (!manual && sinceLast < PROGRAMS_AUTO_RETRY_MS) return;
    programsLastAttemptRef.current = Date.now();

    let cancelled = false;
    let settled = false;
    (async () => {
      // Supabase seul : un distant vide efface le cache (le seed n'est pas écrit).
      const res = await syncMemberProgramsWithSupabase(authId, saisonId);
      settled = true;
      // Échec : cache conservé ; nouvel essai à l'onglet programmes, ou
      // automatiquement après PROGRAMS_AUTO_RETRY_MS.
      if (cancelled || !res.ok) return;
      programsSyncedRef.current = true;
      setMemberPrograms((prev) => {
        const others = prev.filter((p) => p.userId !== localUserId);
        const synced = migrateMemberPrograms(
          (res.programs || []).map((p) => ({ ...p, userId: localUserId }))
        );
        return [...others, ...synced];
      });
    })();

    return () => {
      cancelled = true;
      // Requête abandonnée avant sa réponse (dépendances changées) : elle ne
      // compte pas, l'essai suivant n'attend pas les 30 s.
      if (!settled) programsLastAttemptRef.current = 0;
    };
  }, [
    hydrated,
    supabaseSession?.user?.id,
    currentUser?.id,
    seasons,
    programsSyncTick,
  ]);

  // Liste distante = source de vérité. Les demandes locales absentes sont retirées
  // (l'effet de sauvegarde les enlève aussi d'AsyncStorage).
  const refreshRegistrations = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      return { ok: true, skipped: true };
    }
    const res = await listMemberApplications();
    if (!res.ok || res.skipped) {
      return { ok: false, error: res.error || "تعذّر تحميل الطلبات" };
    }
    const remote = res.applications || [];
    const remoteIds = new Set(remote.map((row) => row.id));
    setRegistrations((prev) => {
      const dropped = prev.filter((row) => !remoteIds.has(row.id)).length;
      if (dropped > 0) {
        console.warn(
          `[registrations] ${dropped} demande(s) locale(s) absente(s) de Supabase retirée(s)`
        );
      }
      return remote;
    });
    return { ok: true, applications: remote };
  }, []);

  // Admin : synchroniser les demandes depuis Supabase (réessaie si échec)
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured() || !supabaseSession?.user?.id) return;
    if (!currentUser || !userHasRole(currentUser, ROLES.ADMIN)) return;
    if (applicationsSyncedRef.current) return;

    let cancelled = false;
    (async () => {
      const res = await refreshRegistrations();
      if (cancelled || !res.ok) return;
      applicationsSyncedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, supabaseSession?.user?.id, currentUser, refreshRegistrations]);

  // Membre : synchroniser ses propres demandes (réessaie si échec)
  useEffect(() => {
    if (!hydrated || !isSupabaseConfigured() || !supabaseSession?.user?.id) return;
    if (!currentUser || !userHasRole(currentUser, ROLES.MEMBER)) return;
    if (userHasRole(currentUser, ROLES.ADMIN)) return;
    if (memberApplicationsSyncedRef.current === supabaseSession.user.id) return;

    let cancelled = false;
    const authId = supabaseSession.user.id;
    (async () => {
      const res = await listMemberApplications();
      if (cancelled) return;
      if (!res.ok || res.skipped) return;
      memberApplicationsSyncedRef.current = authId;
      const remote = res.applications || [];
      // Distant vide inclus : remplace le cache. L'effet de sauvegarde écrit AsyncStorage.
      // Un échec réseau est sorti plus haut : l'ancien cache reste.
      setRegistrations(remote);
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, supabaseSession?.user?.id, currentUser]);

  /** Connexion en cours : bloque la restauration automatique au retour du réseau. */
  const login = async (email, password, options = {}) => {
    loginInProgressRef.current = true;
    try {
      return await runLogin(email, password, options);
    } finally {
      loginInProgressRef.current = false;
    }
  };

  const runLogin = async (email, password, options = {}) => {
    const mail = String(email || "").trim().toLowerCase();
    const preferredRole = options.preferredRole || null;

    if (isSupabaseConfigured()) {
      const authResult = await signInWithEmailPassword(mail, password);
      if (!authResult.ok) return authResult;

      const profile = authResult.profile;
      // Autre compte que le propriétaire des données en mémoire et sur disque :
      // purge avant de charger le nouveau (users cumulait les deux comptes).
      const switchingAccount = ownerAuthIdRef.current !== profile.id;
      if (switchingAccount) {
        await purgeSessionState();
        // L'état du nouveau compte doit être écrit au prochain rendu.
        skipNextSave.current = false;
      }
      ownerAuthIdRef.current = profile.id;
      setCurrentAuthIdHint(profile.id);
      bootOfflineSessionIdRef.current = null;
      markOfflineRestored(false);
      // Après l'éventuelle purge : copie du profil pour la restauration hors ligne.
      rememberServerProfile(profile);
      setSupabaseSession(authResult.session);

      const knownUsers = switchingAccount ? [] : users;
      let local = knownUsers.find(
        (u) =>
          u.email?.toLowerCase() === mail ||
          u.authId === profile.id
      );

      const appUser = profileToAppUser(profile, local || {});
      // Conserver l'id local pour les groupes / progress
      if (local) {
        appUser.id = local.id;
        const { role: sessionRole, roles: rolesForRouting } =
          applySupabaseSessionRole(appUser, profile, preferredRole);
        appUser.roles = rolesForRouting;
        appUser.role = sessionRole;
        setUsers((prev) =>
          prev.map((u) =>
            u.id === local.id
              ? {
                  ...u,
                  authId: profile.id,
                  role: sessionRole,
                  roles: rolesForRouting,
                  accountStatus: ACCOUNT_STATUS.ACTIVE,
                  password: null,
                  firstName: appUser.firstName || u.firstName,
                  lastName: appUser.lastName || u.lastName,
                }
              : u
          )
        );
      } else {
        // Premier login Auth sans fiche locale (ex. admin créé dans Supabase)
        const { role: sessionRole, roles: rolesForRouting } =
          applySupabaseSessionRole(appUser, profile, preferredRole);
        const created = {
          ...appUser,
          id: uid("u"),
          role: sessionRole,
          roles: rolesForRouting,
        };
        setUsers((prev) => [...prev, created]);
        local = created;
        appUser.id = created.id;
        appUser.roles = rolesForRouting;
        appUser.role = sessionRole;
      }

      const sessionUser = applySupabaseSessionRole(
        appUser,
        profile,
        preferredRole
      );
      setCurrentUser(sessionUser);
      maybeRegisterSessionPush(profile.id, { requestPermission: true });
      return {
        ok: true,
        user: sessionUser,
        dashboard: DASHBOARD_BY_ROLE[sessionUser.role],
      };
    }

    // Fallback local (sans .env Supabase)
    const user = users.find((u) => u.email.toLowerCase() === mail);
    if (!user) {
      return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
    }
    if (user.accountStatus === ACCOUNT_STATUS.INVITED || !user.password) {
      return {
        ok: false,
        error: "الحساب غير مفعّل بعد — أنشئ كلمة المرور من شاشة إنشاء الحساب",
      };
    }
    if (user.accountStatus === ACCOUNT_STATUS.INACTIVE) {
      return {
        ok: false,
        error: "تم تعطيل حسابك، يرجى التواصل مع الإدارة",
      };
    }
    if (user.password !== password) {
      return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
    }
    const sessionRole = resolveSessionRole(user, preferredRole);
    const sessionUser = {
      ...user,
      role: sessionRole,
      roles: normalizeRoles(user),
    };
    setCurrentUser(sessionUser);
    return {
      ok: true,
      user: sessionUser,
      dashboard: DASHBOARD_BY_ROLE[sessionRole],
    };
  };

  // Renouvelle le jeton Auth puis aligne l'état React sur la session client.
  const confirmCurrentPassword = async (password) => {
    const result = await verifyCurrentPassword(password);
    if (result.ok && result.session) {
      setSupabaseSession(result.session);
    }
    return result;
  };

  /**
   * Déconnexion unique : un second appel pendant l'attente rejoint la tâche
   * en cours au lieu d'en relancer une. isLoggingOut alimente les boutons.
   */
  const logout = () => {
    if (logoutTaskRef.current) return logoutTaskRef.current;
    setIsLoggingOut(true);
    const task = runLogout().finally(() => {
      logoutTaskRef.current = null;
      setIsLoggingOut(false);
    });
    logoutTaskRef.current = task;
    return task;
  };

  const runLogout = async () => {
    const authId = supabaseSession?.user?.id || currentUser?.authId || null;
    // ± ثمن en attente : envoi tenté tant que la session est valide.
    // Échec ou délai dépassé : la déconnexion continue, la purge abandonne le delta.
    let flushTimer = null;
    try {
      await Promise.race([
        flushMemberProgressDelta({ silent: true }),
        new Promise((resolve) => {
          flushTimer = setTimeout(resolve, LOGOUT_FLUSH_TIMEOUT_MS);
        }),
      ]);
    } catch (e) {
      console.warn("[progress] flush on logout:", e?.message || e);
    } finally {
      clearTimeout(flushTimer);
    }
    // Hors ligne : ni suppression du jeton push ni signOut serveur, impossibles ;
    // signOut attendrait l'initialisation d'auth-js (~30 s si le jeton est expiré).
    const offlineNow = isOffline();
    if (authId && !offlineNow) {
      try {
        const { unregisterPushNotifications } = await import(
          "../lib/pushNotifications"
        );
        await unregisterPushNotifications(authId);
      } catch (e) {
        console.warn("[push] unregister on logout:", e?.message || e);
      }
    }
    // Vider la session locale d'abord pour éviter que LoginScreen
    // redirige vers le dashboard tant que signOutAuth n'a pas fini.
    // Purge des listes liées à la session (pas de resetToSeedData).
    await purgeSessionState();
    if (offlineNow) {
      await clearLocalAuthSession();
      return;
    }
    const signOutResult = await signOutAuth();
    if (!signOutResult.ok) {
      // Hors ligne avec jeton expiré, supabase-js garde la session sur disque :
      // sans ce repli, le prochain démarrage en ligne reconnecterait le compte.
      console.warn("[auth] signOut:", signOutResult.error);
      await clearLocalAuthSession();
    }
  };

  /**
   * Recharge currentUser depuis profiles (focus profil, après édition). Erreur → no-op.
   * fromEmailChangeLink : seul le retour du lien peut lire la session Auth
   * quand l'état React n'a pas encore d'utilisateur.
   */
  const refreshCurrentUser = async ({ fromEmailChangeLink = false } = {}) => {
    // Restauré hors ligne : seule la restauration en ligne (retour réseau) relit le profil.
    if (offlineRestoredRef.current) return { ok: false };
    let authId = currentUser?.authId || supabaseSession?.user?.id;
    if (!authId && fromEmailChangeLink && isSupabaseConfigured()) {
      const sessionResult = await getCurrentAuthSession();
      authId = sessionResult.session?.user?.id || null;
    }
    if (!authId || !isSupabaseConfigured()) {
      return { ok: false };
    }
    try {
      const profileResult = await fetchProfile(authId);
      if (!profileResult.ok || !profileResult.profile) {
        return { ok: false, error: profileResult.error };
      }
      const local =
        users.find((u) => u.authId === authId) ||
        users.find((u) => u.id === currentUser?.id) ||
        currentUser ||
        {};
      const appUser = profileToAppUser(profileResult.profile, local);
      if (local?.id) appUser.id = local.id;
      const sessionUser = applySupabaseSessionRole(
        appUser,
        profileResult.profile,
        currentUser?.role
      );
      rememberServerProfile(profileResult.profile);
      setCurrentUser(sessionUser);
      setUsers((prev) => {
        const idx = prev.findIndex(
          (u) => u.authId === authId || u.id === sessionUser.id
        );
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...sessionUser, id: next[idx].id };
        return next;
      });
      return { ok: true, user: sessionUser };
    } catch {
      return { ok: false };
    }
  };

  /** Dev only: efface AsyncStorage et remet l'état sur les données de seed.js */
  const resetToSeedData = async () => {
    await clearAppState();
    setUsers(emptyState.users);
    setSeasons(emptyState.seasons);
    setRegistrations(emptyState.registrations);
    setGroups(emptyState.groups);
    setProgress(emptyState.progress);
    setAttendance(emptyState.attendance);
    setExams(emptyState.exams);
    setNotifications(emptyState.notifications);
    setMemberPrograms(migrateMemberPrograms(emptyState.memberPrograms || []));
    setSupabaseSession(null);
    setCurrentUser(null);
  };

  /** Demande d'inscription publique (sans mot de passe) */
  const submitMemberApplication = async ({
    fullName,
    school = "",
    level = "",
    phone,
    hifzAmount = "",
    seasonId,
    email = "",
    gender = "",
    seanceId = null,
    seanceName = "",
    formAnswers = null,
  }) => {
    const name = String(fullName || "").trim();
    const phoneClean = String(phone || "").trim();
    const schoolClean = String(school || "").trim();
    const levelClean = String(level || "").trim();
    const hifzClean = String(hifzAmount || "").trim();
    const emailClean = String(email || "").trim().toLowerCase();
    const genderClean = String(gender || "").trim();
    const answers =
      formAnswers && typeof formAnswers === "object" ? formAnswers : {};
    if (!name || !phoneClean || !emailClean || !schoolClean) {
      return { ok: false, error: "الرجاء ملء جميع الحقول المطلوبة" };
    }
    if (!genderClean || (genderClean !== "ذكر" && genderClean !== "أنثى")) {
      return { ok: false, error: "اختر الجنس (ذكر أو أنثى)" };
    }
    if (!seanceId) {
      return { ok: false, error: "اختر الحصة المناسبة لجنسك" };
    }
    if (!emailClean.includes("@")) {
      return { ok: false, error: "أدخل بريداً إلكترونياً صالحاً" };
    }
    if (!String(answers.seasonGoal || "").trim()) {
      return { ok: false, error: "أدخل المقدار الذي تطمح لحفظه هذا الموسم" };
    }
    // Inscription membre toujours ouverte — rattachement optionnel au saison actif
    const resolvedSeasonId =
      seasonId ||
      seasons.find((s) => s.active)?.id ||
      seasons[0]?.id ||
      null;

    const { firstName, lastName } = splitFullName(name);
    const registration = {
      id: uid("r"),
      kind: REGISTRATION_KIND.JOIN,
      userId: null,
      seasonId: resolvedSeasonId,
      fullName: name,
      firstName,
      lastName,
      school: schoolClean,
      level: levelClean,
      phone: phoneClean,
      hifzAmount: hifzClean,
      email: emailClean,
      gender: genderClean,
      seanceId,
      seanceName: String(seanceName || "").trim(),
      formAnswers: answers,
      freeTimes: [],
      status: REGISTRATION_STATUS.PENDING,
      inviteToken: null,
      createdAt: todayStr(),
    };

    if (isSupabaseConfigured()) {
      const sync = await insertPendingMemberApplication(registration);
      if (!sync.ok && !sync.skipped) {
        return { ok: false, error: sync.error || "تعذر حفظ الطلب" };
      }
    }

    pushNotification({
      title: "طلب انضمام جديد",
      body: `طلب انضمام من ${name} — راجعه من طلبات الانضمام والتسجيل`,
      audience: "admin",
      category: NOTIF_CATEGORY.REGISTRATIONS,
      saisonId: registration.seasonId || null,
    });
    return { ok: true, registration };
  };

  /** Compat: ancien enregistrement compte immédiat (évite casser les appels) */
  const registerAccount = ({
    firstName,
    lastName,
    birthDate,
    email,
    password,
    gender = "غير محدد",
  }) => {
    if (isPasswordTooShort(password)) {
      return { ok: false, error: passwordTooShortMessage() };
    }
    if (
      users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    ) {
      return { ok: false, error: "هذا البريد مستخدم مسبقاً" };
    }
    const user = {
      id: uid("u"),
      email: email.trim().toLowerCase(),
      password,
      firstName,
      lastName,
      birthDate,
      gender,
      role: ROLES.MEMBER,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
    };
    setUsers((prev) => [...prev, user]);
    return { ok: true, user };
  };

  const resetPassword = async (email, newPassword) => {
    // Avec Supabase : envoi d'un e-mail de récupération (OTP)
    if (isSupabaseConfigured()) {
      return requestPasswordReset(email);
    }

    const mail = email.trim().toLowerCase();
    const exists = users.find((u) => u.email.toLowerCase() === mail);
    if (!exists) {
      return { ok: false, error: "لا يوجد حساب بهذا البريد" };
    }
    if (isPasswordTooShort(newPassword)) {
      return { ok: false, error: passwordTooShortMessage() };
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.email.toLowerCase() === mail ? { ...u, password: newPassword } : u
      )
    );
    return { ok: true };
  };

  const startNewSeason = async ({ name, startDate, version, type }) => {
    const seasonName = String(name || "").trim();
    const seasonType = String(type || SEASON_TYPES.REGULAR).trim().toLowerCase();
    const start = parseSeasonStartDate(startDate);
    const versionNum = Number.parseInt(String(version || "").trim(), 10);
    if (
      seasonType !== SEASON_TYPES.REGULAR &&
      seasonType !== SEASON_TYPES.SUMMER
    ) {
      return {
        ok: false,
        error: "نوع الموسم غير صالح — اختر موسماً عادياً أو مدرسة صيفية",
      };
    }
    if (!seasonName || !Number.isFinite(versionNum) || versionNum < 1) {
      return { ok: false, error: "املأ جميع الحقول" };
    }
    if (!start) {
      return {
        ok: false,
        error: "صيغة التاريخ غير صالحة — استخدم 2026/09/01",
      };
    }
    if (!isSupabaseConfigured()) {
      return { ok: false, error: "Supabase غير مفعّل" };
    }

    // Le snapshot v2 est calculé dans la transaction de start_new_season.
    const rpcRes = await startNewSeasonRpc({
      name: seasonName,
      startDate: start,
      version: versionNum,
      type: seasonType,
    });
    if (!rpcRes.ok) {
      return { ok: false, error: rpcRes.error || "تعذر انطلاق الموسم" };
    }

    const payload = rpcRes.result || {};
    // chat_group_ids : policy storage chat_group_avatars_delete_admin =
    // private.is_chat_group_admin (superviseur de séance), pas l'admin
    // plateforme. Après la suppression des groupes le contrôle échoue.
    // Les fichiers {groupId}.jpg restent orphelins.
    const supervisorIds = Array.isArray(payload.supervisor_ids)
      ? payload.supervisor_ids.filter(Boolean)
      : [];
    const deletedIds = [];
    const failedIds = [];
    const supervisorErrors = [];
    for (const userId of supervisorIds) {
      const removed = await deleteSupervisorAccount({ userId });
      if (removed.ok) deletedIds.push(userId);
      else {
        failedIds.push(userId);
        supervisorErrors.push(removed.error || userId);
      }
    }

    const remote = await fetchSaisons();
    if (remote.ok) {
      setSeasons(uniqSeasonsById(remote.seasons));
    } else {
      setSeasons((prev) =>
        uniqSeasonsById([
          ...prev.map((s) =>
            s.active ? { ...s, active: false, registrationOpen: false } : s
          ),
          {
            id: payload.saison_id,
            name: seasonName,
            type: seasonType,
            startDate: start,
            version: versionNum,
            registrationOpen: true,
            active: true,
            remote: seasonType === SEASON_TYPES.SUMMER,
          },
        ])
      );
    }

    await refreshRegistrations();
    setNotifications([]);

    const deletedSet = new Set(deletedIds);
    const failedSet = new Set(failedIds);
    setUsers((prev) =>
      prev.flatMap((user) => {
        const ids = [user.id, user.authId].filter(Boolean);
        if (ids.some((id) => deletedSet.has(id))) return [];
        if (ids.some((id) => failedSet.has(id))) {
          return [{ ...user, accountStatus: ACCOUNT_STATUS.INACTIVE }];
        }
        // Profil mixte : la RPC a retiré le rôle superviseur, le compte reste.
        if (
          userHasRole(user, ROLES.SUPERVISOR) &&
          userHasRole(user, ROLES.MEMBER) &&
          !userHasRole(user, ROLES.ADMIN)
        ) {
          const roles = normalizeRoles(user).filter((role) => role !== ROLES.SUPERVISOR);
          return [
            {
              ...user,
              role: user.role === ROLES.SUPERVISOR ? ROLES.MEMBER : user.role,
              roles,
            },
          ];
        }
        return [user];
      })
    );

    return {
      ok: true,
      season: { id: payload.saison_id, name: seasonName },
      supervisorsDeleted: deletedIds.length,
      supervisorsTotal: supervisorIds.length,
      supervisorErrors,
    };
  };

  const submitSeasonRegistration = async ({
    seasonId,
    freeTimes = [],
    seanceId = null,
    seanceName = "",
    formAnswers = null,
    hifzAmount = "",
    userId = currentUser?.id,
  }) => {
    if (!userId) return { ok: false, error: "يجب تسجيل الدخول" };

    let season = seasons.find((s) => s.id === seasonId) || null;
    // Associer automatiquement au musim actif ouvert si l'id est absent / invalide
    if (!isSeasonRegistrationAvailable(season)) {
      const fallbackType = season?.type || SEASON_TYPES.REGULAR;
      season =
        seasons.find(
          (s) =>
            s.type === fallbackType && isSeasonRegistrationAvailable(s)
        ) || null;
    }
    if (!isSeasonRegistrationAvailable(season)) {
      return {
        ok: false,
        error:
          "باب التسجيل مغلق حالياً — يُفتح عند انطلاق موسم جديد من الإدارة",
      };
    }

    const boundSeasonId = season.id;
    const member =
      users.find((u) => u.id === userId || u.authId === userId) ||
      (currentUser?.id === userId || currentUser?.authId === userId
        ? currentUser
        : null);
    const authUserId = member?.authId || currentUser?.authId || null;
    const matchIds = [userId, authUserId, member?.id].filter(Boolean);
    const exists = registrations.find(
      (r) =>
        matchIds.includes(r.userId) &&
        r.seasonId === boundSeasonId &&
        r.status !== REGISTRATION_STATUS.REJECTED
    );
    if (exists) {
      return { ok: false, error: "لديك طلب تسجيل مسبقاً لهذا الموسم" };
    }
    if (!seanceId) {
      return { ok: false, error: "اختر الحصة المناسبة" };
    }
    const answers =
      formAnswers && typeof formAnswers === "object" ? formAnswers : {};
    if (!String(answers.seasonGoal || hifzAmount || "").trim()) {
      return {
        ok: false,
        error: "أدخل المقدار الذي تطمح لحفظه هذا الموسم",
      };
    }
    const email = String(member?.email || currentUser?.email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      return { ok: false, error: "البريد الإلكتروني للحساب غير متوفر" };
    }

    if (isSupabaseConfigured()) {
      const remoteDup = await findOpenSeasonRenewal({
        email,
        seasonId: boundSeasonId,
        userId: authUserId,
      });
      if (!remoteDup.ok && !remoteDup.skipped) {
        return {
          ok: false,
          error: remoteDup.error || "تعذر التحقق من طلبات إعادة التسجيل",
        };
      }
      if (remoteDup.application) {
        return { ok: false, error: "لديك طلب تسجيل مسبقاً لهذا الموسم" };
      }
    }

    const { firstName, lastName } = splitFullName(
      member
        ? `${member.firstName || ""} ${member.lastName || ""}`.trim()
        : ""
    );
    const registration = {
      id: uid("r"),
      kind: REGISTRATION_KIND.SEASON_RENEWAL,
      userId: authUserId || userId,
      seasonId: boundSeasonId,
      freeTimes: Array.isArray(freeTimes) ? freeTimes : [],
      seanceId,
      seanceName: String(seanceName || "").trim(),
      hifzAmount: String(hifzAmount || answers.seasonGoal || "").trim(),
      formAnswers: answers,
      fullName: member
        ? `${member.firstName || ""} ${member.lastName || ""}`.trim()
        : "",
      firstName: member?.firstName || firstName,
      lastName: member?.lastName || lastName,
      email,
      phone: member?.phone || "",
      school: member?.school || "",
      level: member?.level || "",
      gender: member?.gender || "",
      status: REGISTRATION_STATUS.PENDING,
      createdAt: todayStr(),
    };

    if (isSupabaseConfigured()) {
      const sync = await insertPendingMemberApplication(registration);
      if (!sync.ok && !sync.skipped) {
        return { ok: false, error: sync.error || "تعذر حفظ طلب إعادة التسجيل" };
      }
    }

    setRegistrations((prev) => [...prev, registration]);
    pushNotification({
      title: "إعادة تسجيل موسم",
      body: "وصل طلب إعادة تسجيل من عضو حالي — راجعه من طلبات الانضمام والتسجيل",
      audience: "admin",
      category: NOTIF_CATEGORY.REGISTRATIONS,
      saisonId: registration.seasonId || null,
    });
    return { ok: true, registration };
  };

  const reviewRegistration = async (registrationId, status) => {
    try {
      const reg = registrations.find((r) => r.id === registrationId);
      if (!reg) return { ok: false, error: "الطلب غير موجود" };

      const kind = getRegistrationKind(reg);
      const isSeasonRenewal = kind === REGISTRATION_KIND.SEASON_RENEWAL;

      if (status === REGISTRATION_STATUS.REJECTED) {
        const memberForEmail = users.find(
          (u) => u.id === reg.userId || u.authId === reg.userId
        );
        const sync = await upsertMemberApplication(
          {
            ...reg,
            email:
              reg.email ||
              memberForEmail?.email ||
              "",
          },
          REGISTRATION_STATUS.REJECTED
        );
        if (!sync.ok && !sync.skipped) {
          return {
            ok: false,
            error: sync.error || "تعذر حفظ الرفض في Supabase",
          };
        }

        setRegistrations((prev) =>
          prev.map((r) =>
            r.id === registrationId
              ? { ...r, status: REGISTRATION_STATUS.REJECTED }
              : r
          )
        );
        pushNotification({
          title: isSeasonRenewal ? "رُفضت إعادة التسجيل" : "تم رفض طلب الانضمام",
          body: isSeasonRenewal
            ? "رُفض طلب إعادة تسجيل موسم"
            : `رُفض طلب: ${reg.fullName || reg.phone}`,
          audience: isSeasonRenewal && reg.userId ? "user" : "admin",
          userId: isSeasonRenewal ? reg.userId : undefined,
        });
        return { ok: true, kind };
      }

      if (status === REGISTRATION_STATUS.ACCEPTED) {
        // Horodatage complet de la décision (renouvellement et adhésion).
        const acceptedAt = new Date().toISOString();

        if (isSeasonRenewal) {
          const member = users.find(
            (u) => u.id === reg.userId || u.authId === reg.userId
          );
          const authUserId = member?.authId || reg.userId;
          const email = String(reg.email || member?.email || "")
            .trim()
            .toLowerCase();
          const goal = String(
            reg.hifzAmount || reg.formAnswers?.seasonGoal || ""
          ).trim();

          if (!email) {
            return {
              ok: false,
              error: "تعذر قبول الطلب — البريد الإلكتروني غير متوفر",
            };
          }

          const sync = await upsertMemberApplication(
            {
              ...reg,
              email,
              userId: authUserId,
              hifzAmount: goal || reg.hifzAmount,
              acceptedAt,
            },
            REGISTRATION_STATUS.ACTIVATED
          );
          if (!sync.ok && !sync.skipped) {
            return {
              ok: false,
              error: sync.error || "تعذر حفظ قبول إعادة التسجيل في Supabase",
            };
          }

          if (authUserId && goal) {
            const profileSync = await updateMemberInfo(authUserId, {
              hifzAmount: goal,
            });
            if (!profileSync.ok && !profileSync.skipped) {
              return {
                ok: false,
                error:
                  profileSync.error ||
                  "قُبل الطلب في القاعدة لكن تعذر تحديث مقدار الحفظ في الملف الشخصي",
              };
            }
            setUsers((prev) =>
              prev.map((u) =>
                u.id === reg.userId || u.authId === reg.userId
                  ? { ...u, hifzAmount: goal }
                  : u
              )
            );
            if (
              currentUser?.id === reg.userId ||
              currentUser?.authId === reg.userId
            ) {
              setCurrentUser((prev) =>
                prev ? { ...prev, hifzAmount: goal } : prev
              );
            }
          }

          setRegistrations((prev) =>
            prev.map((r) =>
              r.id === registrationId
                ? { ...r, status: REGISTRATION_STATUS.ACCEPTED, acceptedAt }
                : r
            )
          );
          if (reg.userId) {
            pushNotification({
              title: "قُبل تسجيلك للموسم",
              body: "تم قبول طلب إعادة تسجيلك للموسم الجديد.",
              audience: "user",
              userId: reg.userId,
            });
          }
          pushNotification({
            title: "إعادة تسجيل مقبولة",
            body: "قُبلت إعادة تسجيل عضو للموسم.",
            audience: "admin",
          });
          return { ok: true, registration: reg, kind };
        }

        // Adhésion : le même horodatage complet, statut invited (compte encore à créer).
        const sync = await upsertMemberApplication(
          { ...reg, acceptedAt },
          REGISTRATION_STATUS.INVITED
        );
        if (!sync.ok) {
          return {
            ok: false,
            error:
              sync.error ||
              "تعذر حفظ بيانات العضو في Supabase — نفّذ member_applications.sql وتأكد من جلسة الأدمن",
          };
        }

        setRegistrations((prev) =>
          prev.map((r) =>
            r.id === registrationId
              ? {
                  ...r,
                  status: REGISTRATION_STATUS.INVITED,
                  inviteToken: null,
                  acceptedAt,
                }
              : r
          )
        );
        pushNotification({
          title: "دعوة انضمام",
          body: `تم قبول طلب انضمام ${reg.fullName}. يمكنه إنشاء حسابه بالبريد الإلكتروني.`,
          audience: "admin",
        });
        return { ok: true, registration: reg, kind };
      }

      setRegistrations((prev) =>
        prev.map((r) => (r.id === registrationId ? { ...r, status } : r))
      );
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e?.message || "حدث خطأ أثناء مراجعة الطلب",
      };
    }
  };

  /** إنشاء حساب العضو بعد قبول الطلب (بريد + رمز OTP). */
  const activateInvite = async ({ email, password, confirmPassword, code }) => {
    const mail = String(email || "").trim().toLowerCase();
    const otp = String(code || "").trim();
    if (!mail) return { ok: false, error: "أدخل البريد الإلكتروني" };
    if (!/^\d{6}$/.test(otp)) {
      return { ok: false, error: "أدخل رمز التحقق المكوّن من 6 أرقام" };
    }
    if (isPasswordTooShort(password)) {
      return { ok: false, error: passwordTooShortMessage() };
    }
    if (password !== confirmPassword) {
      return { ok: false, error: "كلمة المرور غير متطابقة" };
    }

    const pendingUser = users.find(
      (u) =>
        u.email?.toLowerCase() === mail &&
        u.accountStatus === ACCOUNT_STATUS.INVITED &&
        u.role === ROLES.MEMBER
    );
    if (pendingUser) {
      if (isSupabaseConfigured()) {
        const authResult = await signUpWithProfile({
          email: pendingUser.email,
          password,
          role: pendingUser.role,
          firstName: pendingUser.firstName,
          lastName: pendingUser.lastName,
          code: otp,
        });
        if (!authResult.ok) return authResult;
        setUsers((prev) =>
          prev.map((u) =>
            u.id === pendingUser.id
              ? {
                  ...u,
                  password: null,
                  authId: authResult.authUser.id,
                  accountStatus: ACCOUNT_STATUS.ACTIVE,
                  inviteToken: null,
                }
              : u
          )
        );
        pushNotification({
          title: "تم تفعيل الحساب",
          body: `مرحباً ${pendingUser.firstName}، حسابك جاهز لتسجيل الدخول`,
          audience: "user",
          userId: pendingUser.id,
        });
        return {
          ok: true,
          user: {
            ...pendingUser,
            password: null,
            authId: authResult.authUser.id,
            accountStatus: ACCOUNT_STATUS.ACTIVE,
          },
          role: pendingUser.role,
          needsEmailConfirmation: authResult.needsEmailConfirmation,
          warning: authResult.warning || undefined,
        };
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === pendingUser.id
            ? {
                ...u,
                password,
                accountStatus: ACCOUNT_STATUS.ACTIVE,
                inviteToken: null,
              }
            : u
        )
      );
      pushNotification({
        title: "تم تفعيل الحساب",
        body: `مرحباً ${pendingUser.firstName}، حسابك جاهز لتسجيل الدخول`,
        audience: "user",
        userId: pendingUser.id,
      });
      return {
        ok: true,
        user: { ...pendingUser, password, accountStatus: ACCOUNT_STATUS.ACTIVE },
        role: pendingUser.role,
      };
    }

    const reg = registrations.find(
      (r) =>
        r.email?.toLowerCase() === mail &&
        r.status === REGISTRATION_STATUS.INVITED
    );
    if (!reg) {
      if (isSupabaseConfigured()) {
        const lookup = await getPendingSupervisorInvitation(mail);
        if (lookup.ok && lookup.invitation) {
          return activateSupervisorAccount({
            email: mail,
            password,
            confirmPassword,
            code: otp,
          });
        }

        // Activation cross-device : pas besoin d'une ligne locale « invited ».
        // L'Edge Function vérifie member_applications.status = invited.
        const authResult = await signUpWithProfile({
          email: mail,
          password,
          role: ROLES.MEMBER,
          firstName: "",
          lastName: "",
          code: otp,
        });
        if (!authResult.ok) return authResult;

        const authId = authResult.authUser.id;

        const profile = authResult.profile || {};
        const firstName =
          profile.first_name || profile.firstName || splitFullName(profile.full_name || "").firstName || "";
        const lastName =
          profile.last_name || profile.lastName || splitFullName(profile.full_name || "").lastName || "";
        const genderRaw = profile.genre || profile.gender || "";
        const gender =
          genderRaw === "ذكر" || genderRaw === "أنثى" ? genderRaw : "";

        const user = {
          id: uid("u"),
          authId,
          email: mail,
          password: null,
          firstName,
          lastName,
          birthDate: "2000/01/01",
          school: profile.school || "",
          level: profile.level || "",
          phone: profile.phone || "",
          hifzAmount: profile.hifz_amount || profile.hifzAmount || "",
          gender,
          role: ROLES.MEMBER,
          roles: [ROLES.MEMBER],
          accountStatus: ACCOUNT_STATUS.ACTIVE,
          seasonId: null,
        };
        setUsers((prev) => [...prev, user]);
        setRegistrations((prev) =>
          prev.map((r) =>
            r.email?.toLowerCase() === mail &&
            (r.status === REGISTRATION_STATUS.INVITED ||
              r.status === REGISTRATION_STATUS.PENDING)
              ? {
                  ...r,
                  status: REGISTRATION_STATUS.ACTIVATED,
                  userId: user.id,
                  inviteToken: null,
                }
              : r
          )
        );
        pushNotification({
          title: "تم إنشاء الحساب",
          body: `مرحباً ${firstName || mail}، يمكنك تسجيل الدخول الآن`,
          audience: "user",
          userId: user.id,
        });
        return {
          ok: true,
          user,
          role: ROLES.MEMBER,
          needsEmailConfirmation: !!authResult.needsEmailConfirmation,
          warning: authResult.warning || undefined,
        };
      }
      return {
        ok: false,
        error: "لا توجد دعوة مقبولة لهذا البريد أو الحساب مفعّل مسبقاً",
      };
    }

    const existingUser = users.find((u) => u.email.toLowerCase() === mail);

    if (existingUser && userHasRole(existingUser, ROLES.SUPERVISOR)) {
      return {
        ok: false,
        error:
          "هذا البريد لحساب مشرف. لا يُستخدم كحساب عضو — أدخل بريداً آخر للعضو.",
      };
    }
    if (existingUser && userHasRole(existingUser, ROLES.ADMIN)) {
      return {
        ok: false,
        error:
          "هذا البريد لحساب الإدارة. استخدم بريداً آخر لإنشاء حساب العضو.",
      };
    }

    // Même e-mail déjà utilisé pour un membre → réactivation du même الحساب
    if (existingUser) {
      let authId = existingUser.authId || null;
      let needsEmailConfirmation = false;
      let activationWarning = null;

      if (isSupabaseConfigured()) {
        // L'écran demande de choisir un nouveau mot de passe. Même si une fiche
        // locale existe déjà, passer par l'activation distante afin de créer le
        // compte Auth ou de mettre à jour son mot de passe. Une tentative de
        // connexion ici interpréterait à tort le nouveau mot de passe comme
        // l'ancien et retournerait « identifiants incorrects ».
        const authResult = await signUpWithProfile({
          email: mail,
          password,
          role: existingUser.role || ROLES.MEMBER,
          firstName:
            existingUser.firstName ||
            reg.firstName ||
            splitFullName(reg.fullName).firstName,
          lastName:
            existingUser.lastName ||
            reg.lastName ||
            splitFullName(reg.fullName).lastName,
          code: otp,
        });
        if (!authResult.ok) return authResult;
        authId = authResult.authUser.id;
        needsEmailConfirmation = !!authResult.needsEmailConfirmation;
        activationWarning = authResult.warning || null;
      } else if (
        existingUser.accountStatus === ACCOUNT_STATUS.ACTIVE &&
        existingUser.password &&
        existingUser.password !== password
      ) {
        return {
          ok: false,
          error: "كلمة المرور غير صحيحة للحساب الموجود بهذا البريد",
        };
      }

      const merged = withMergedRoles(
        {
          ...existingUser,
          authId,
          password: isSupabaseConfigured()
            ? null
            : existingUser.password || password,
          accountStatus: ACCOUNT_STATUS.ACTIVE,
          inviteToken: null,
          school: reg.school || existingUser.school || "",
          level: reg.level || existingUser.level,
          phone: reg.phone || existingUser.phone,
          hifzAmount: reg.hifzAmount || existingUser.hifzAmount || "",
          seasonId: reg.seasonId || existingUser.seasonId,
        },
        ROLES.MEMBER
      );

      setUsers((prev) =>
        prev.map((u) => (u.id === existingUser.id ? merged : u))
      );
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === reg.id
            ? {
                ...r,
                status: REGISTRATION_STATUS.ACTIVATED,
                userId: existingUser.id,
                inviteToken: null,
              }
            : r
        )
      );
      pushNotification({
        title: "تم تفعيل عضوية الحساب",
        body: `تم ربط طلب الانضمام بالحساب الموجود (${mail})`,
        audience: "user",
        userId: existingUser.id,
      });
      return {
        ok: true,
        user: merged,
        role: ROLES.MEMBER,
        needsEmailConfirmation,
        warning: activationWarning || undefined,
      };
    }

    let authId = null;
    let needsEmailConfirmation = false;
    let activationWarning = null;
    if (isSupabaseConfigured()) {
      const authResult = await signUpWithProfile({
        email: mail,
        password,
        role: ROLES.MEMBER,
        firstName: reg.firstName || splitFullName(reg.fullName).firstName,
        lastName: reg.lastName || splitFullName(reg.fullName).lastName,
        code: otp,
      });
      if (!authResult.ok) return authResult;
      authId = authResult.authUser.id;
      needsEmailConfirmation = !!authResult.needsEmailConfirmation;
      activationWarning = authResult.warning || null;
    }

    const user = {
      id: uid("u"),
      authId,
      email: mail,
      password: isSupabaseConfigured() ? null : password,
      firstName: reg.firstName || splitFullName(reg.fullName).firstName,
      lastName: reg.lastName || splitFullName(reg.fullName).lastName,
      birthDate: "2000/01/01",
      school: reg.school || "",
      level: reg.level,
      phone: reg.phone,
      hifzAmount: reg.hifzAmount || "",
      gender:
        reg.gender === "ذكر" || reg.gender === "أنثى" ? reg.gender : "",
      role: ROLES.MEMBER,
      roles: [ROLES.MEMBER],
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      seasonId: reg.seasonId,
    };
    setUsers((prev) => [...prev, user]);
    setRegistrations((prev) =>
      prev.map((r) =>
        r.id === reg.id
          ? {
              ...r,
              status: REGISTRATION_STATUS.ACTIVATED,
              userId: user.id,
              inviteToken: null,
            }
          : r
      )
    );
    pushNotification({
      title: "تم إنشاء الحساب",
      body: `مرحباً ${user.firstName}، يمكنك تسجيل الدخول الآن`,
      audience: "user",
      userId: user.id,
    });
    return {
      ok: true,
      user,
      role: ROLES.MEMBER,
      needsEmailConfirmation,
      warning: activationWarning || undefined,
    };
  };

  /** إنشاء حساب المشرف بالبريد (بعد تعيينه من الإدارة) */
  const activateSupervisorAccount = async ({
    fullName,
    email,
    password,
    confirmPassword,
    code,
  }) => {
    const mail = canonicalEmail(email);
    const otp = String(code || "").trim();
    if (!mail) return { ok: false, error: "أدخل البريد الإلكتروني" };
    if (!/^\d{6}$/.test(otp)) {
      return { ok: false, error: "أدخل رمز التحقق المكوّن من 6 أرقام" };
    }
    if (isPasswordTooShort(password)) {
      return { ok: false, error: passwordTooShortMessage() };
    }
    if (password !== confirmPassword) {
      return { ok: false, error: "كلمة المرور غير متطابقة" };
    }

    let invitation = null;
    if (isSupabaseConfigured()) {
      const lookup = await getPendingSupervisorInvitation(mail);
      if (!lookup.ok) return lookup;
      invitation = lookup.invitation || null;
    }

    const pendingUser = users.find(
      (u) =>
        canonicalEmail(u.email) === mail &&
        u.role === ROLES.SUPERVISOR &&
        u.accountStatus === ACCOUNT_STATUS.INVITED
    );

    if (!pendingUser && !invitation) {
      return {
        ok: false,
        error: "لا توجد دعوة مشرف لهذا البريد أو الحساب مفعّل مسبقاً",
      };
    }

    const typed = splitFullName(fullName);
    const firstName = String(
      invitation?.first_name || pendingUser?.firstName || typed.firstName || ""
    ).trim();
    const lastName = String(
      invitation?.last_name || pendingUser?.lastName || typed.lastName || ""
    ).trim();

    if (isSupabaseConfigured()) {
      const authResult = await signUpWithProfile({
        email: mail,
        password,
        role: ROLES.SUPERVISOR,
        firstName,
        lastName,
        code: otp,
      });
      if (!authResult.ok) return authResult;

      const activatedUser = pendingUser
        ? {
            ...pendingUser,
            firstName,
            lastName,
            password: null,
            authId: authResult.authUser.id,
            accountStatus: ACCOUNT_STATUS.ACTIVE,
            inviteToken: null,
          }
        : {
            id: uid("u"),
            email: mail,
            password: null,
            firstName,
            lastName,
            birthDate: "2000/01/01",
            gender: "غير محدد",
            role: ROLES.SUPERVISOR,
            roles: [ROLES.SUPERVISOR],
            accountStatus: ACCOUNT_STATUS.ACTIVE,
            authId: authResult.authUser.id,
            inviteToken: null,
          };

      setUsers((prev) =>
        pendingUser
          ? prev.map((u) => (u.id === pendingUser.id ? activatedUser : u))
          : [...prev, activatedUser]
      );
      pushNotification({
        title: "تم إنشاء الحساب",
        body: `مرحباً ${firstName || mail}، حسابك جاهز لتسجيل الدخول`,
        audience: "user",
        userId: activatedUser.id,
      });
      return {
        ok: true,
        user: activatedUser,
        role: ROLES.SUPERVISOR,
        needsEmailConfirmation: authResult.needsEmailConfirmation,
      };
    }

    if (!pendingUser) {
      return {
        ok: false,
        error: "لا توجد دعوة مشرف لهذا البريد أو الحساب مفعّل مسبقاً",
      };
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === pendingUser.id
          ? {
              ...u,
              firstName,
              lastName,
              password,
              accountStatus: ACCOUNT_STATUS.ACTIVE,
              inviteToken: null,
            }
          : u
      )
    );
    pushNotification({
      title: "تم إنشاء الحساب",
      body: `مرحباً ${pendingUser.firstName}، حسابك جاهز لتسجيل الدخول`,
      audience: "user",
      userId: pendingUser.id,
    });
    return {
      ok: true,
      user: {
        ...pendingUser,
        password,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      },
      role: ROLES.SUPERVISOR,
    };
  };

  const createGroup = ({
    seasonId,
    name,
    freeTimeSlot,
    supervisorId,
    schedule,
    remote = false,
  }) => {
    const group = {
      id: uid("g"),
      seasonId,
      name,
      freeTimeSlot,
      supervisorId,
      memberIds: [],
      schedule,
      remote,
    };
    setGroups((prev) => [...prev, group]);
    return group;
  };

  const updateGroup = (groupId, patch) => {
    const target = groups.find((g) => g.id === groupId);
    if (!target) return { ok: false, error: "المجموعة غير موجودة" };
    const name = patch.name !== undefined ? String(patch.name).trim() : null;
    if (name !== null && !name) {
      return { ok: false, error: "اسم المجموعة مطلوب" };
    }
    if (patch.supervisorId) {
      const supervisor = users.find(
        (u) =>
          u.id === patch.supervisorId && userHasRole(u, ROLES.SUPERVISOR)
      );
      if (!supervisor) {
        return { ok: false, error: "المشرف المحدد غير موجود" };
      }
    }
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              ...(name !== null ? { name } : {}),
              ...(patch.supervisorId !== undefined
                ? { supervisorId: patch.supervisorId }
                : {}),
            }
          : g
      )
    );
    return { ok: true };
  };

  const deleteGroup = (groupId) => {
    const target = groups.find((g) => g.id === groupId);
    if (!target) return { ok: false, error: "المجموعة غير موجودة" };
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setProgress((prev) => prev.filter((p) => p.groupId !== groupId));
    setAttendance((prev) => prev.filter((a) => a.groupId !== groupId));
    setExams((prev) => prev.filter((e) => e.groupId !== groupId));
    return { ok: true };
  };

  const assignMemberToGroup = (groupId, memberId) => {
    setGroups((prev) => {
      const target = prev.find((g) => g.id === groupId);
      const updated = prev.map((g) => {
        if (g.id === groupId) {
          if (g.memberIds.includes(memberId)) return g;
          return { ...g, memberIds: [...g.memberIds, memberId] };
        }
        return {
          ...g,
          memberIds: g.memberIds.filter((id) => id !== memberId),
        };
      });

      if (target) {
        setProgress((prevProgress) => {
          const existing = prevProgress.find(
            (p) => p.memberId === memberId && p.seasonId === target.seasonId
          );
          if (existing) {
            return prevProgress.map((p) =>
              p.id === existing.id ? { ...p, groupId } : p
            );
          }
          return [
            ...prevProgress,
            {
              id: uid("p"),
              memberId,
              groupId,
              seasonId: target.seasonId,
              hifzPages: 0,
              reviewPages: 0,
              targetPages: 60,
              notes: [],
              lastEvaluation: "—",
            },
          ];
        });
        pushNotification({
          title: "تم توزيعك على مجموعة",
          body: `أُسندت إلى المجموعة: ${target.name}`,
          audience: "user",
          userId: memberId,
          category: NOTIF_CATEGORY.SESSIONS,
          saisonId: target.seasonId || null,
        });
      }

      return updated;
    });
  };

  const assignSupervisorToGroup = (groupId, supervisorId) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, supervisorId } : g))
    );
  };

  /** حذف مشرف ثانوي (يمكن إعادة إضافته لاحقاً بنفس البريد) */
  const removeSupervisor = (supervisorId) => {
    const target = users.find(
      (u) => u.id === supervisorId && userHasRole(u, ROLES.SUPERVISOR)
    );
    if (!target) {
      return { ok: false, error: "المشرف غير موجود" };
    }

    setGroups((prev) =>
      prev.map((g) =>
        g.supervisorId === supervisorId ? { ...g, supervisorId: null } : g
      )
    );

    // Si le compte a aussi le rôle membre, on retire seulement le rôle superviseur
    if (userHasRole(target, ROLES.MEMBER) || userHasRole(target, ROLES.ADMIN)) {
      const nextRoles = normalizeRoles(target).filter(
        (r) => r !== ROLES.SUPERVISOR
      );
      setUsers((prev) =>
        prev.map((u) =>
          u.id === supervisorId
            ? {
                ...u,
                role: nextRoles[0] || ROLES.MEMBER,
                roles: nextRoles,
              }
            : u
        )
      );
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== supervisorId));
      if (currentUser?.id === supervisorId) {
        setCurrentUser(null);
      }
    }

    pushNotification({
      title: "تم حذف مشرف",
      body: `تم حذف ${target.firstName} ${target.lastName}`,
      audience: "admin",
      category: NOTIF_CATEGORY.SUPERVISORS,
    });

    return { ok: true };
  };

  const addSupervisor = ({
    firstName,
    lastName,
    email,
    birthDate = "2000/01/01",
    gender = "ذكر",
    groupName,
    groupId,
    newGroup,
    seasonId: seasonIdArg,
  }) => {
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return { ok: false, error: "املأ الاسم واللقب والبريد" };
    }

    const mail = email.trim().toLowerCase();

    const typedName = (groupName || newGroup?.name || "").trim();
    const seasonId =
      seasonIdArg ||
      newGroup?.seasonId ||
      seasons.find((s) => s.active)?.id ||
      seasons[0]?.id ||
      null;

    if (!groupId && !typedName) {
      return {
        ok: false,
        error: "أدخل اسم المجموعة المعنية بهذا المشرف",
      };
    }
    if (users.some((u) => u.email.toLowerCase() === mail)) {
      return { ok: false, error: "هذا البريد مستخدم مسبقاً" };
    }

    let assignedGroup = null;
    let pendingNewGroup = null;
    let created = false;

    if (groupId) {
      assignedGroup = groups.find((g) => g.id === groupId);
      if (!assignedGroup) {
        return { ok: false, error: "المجموعة المحددة غير موجودة" };
      }
    } else {
      const match = groups.find(
        (g) => g.name.trim().toLowerCase() === typedName.toLowerCase()
      );
      if (match) {
        assignedGroup = match;
      } else {
        const sid =
          seasonId || seasons.find((s) => s.active)?.id || seasons[0]?.id || null;
        pendingNewGroup = {
          id: uid("g"),
          seasonId: sid,
          name: typedName,
          freeTimeSlot: newGroup?.freeTimeSlot || "",
          supervisorId: null,
          memberIds: [],
          schedule: newGroup?.schedule || "",
          remote: !!newGroup?.remote,
        };
        created = true;
      }
    }

    const token = inviteToken();
    const resolvedSeasonId =
      assignedGroup?.seasonId || pendingNewGroup?.seasonId || seasonId;

    const user = {
      id: uid("u"),
      email: mail,
      password: null,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      gender,
      role: ROLES.SUPERVISOR,
      accountStatus: ACCOUNT_STATUS.INVITED,
      inviteToken: token,
      seasonId: resolvedSeasonId,
    };
    setUsers((prev) => [...prev, user]);

    if (assignedGroup && !pendingNewGroup) {
      assignSupervisorToGroup(assignedGroup.id, user.id);
      assignedGroup = { ...assignedGroup, supervisorId: user.id };
    } else if (pendingNewGroup) {
      assignedGroup = { ...pendingNewGroup, supervisorId: user.id };
      setGroups((prev) => [...prev, assignedGroup]);
    }

    pushNotification({
      title: "تمت إضافة مشرف",
      body: `تم تعيين ${user.firstName} ${user.lastName} على ${assignedGroup?.name || typedName}`,
      audience: "admin",
      category: NOTIF_CATEGORY.SUPERVISORS,
    });

    return {
      ok: true,
      user,
      group: assignedGroup,
      groupName: assignedGroup?.name || typedName,
      created,
      inviteToken: token,
    };
  };

  const addMember = ({
    firstName,
    lastName,
    birthDate,
    gender,
    groupId,
    email,
    password,
  }) => {
    if (!firstName?.trim() || !lastName?.trim()) {
      return { ok: false, error: "املأ الاسم واللقب" };
    }
    if (isPasswordTooShort(password)) {
      return { ok: false, error: passwordTooShortMessage() };
    }
    const mail =
      email?.trim().toLowerCase() || `member_${Date.now()}@mosque.ma`;
    if (users.some((u) => u.email.toLowerCase() === mail)) {
      return { ok: false, error: "هذا البريد مستخدم مسبقاً" };
    }
    const user = {
      id: uid("u"),
      email: mail,
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birthDate || "2000/01/01",
      gender: gender || "غير محدد",
      role: ROLES.MEMBER,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
    };
    setUsers((prev) => [...prev, user]);
    if (groupId) {
      assignMemberToGroup(groupId, user.id);
    }
    return { ok: true, user };
  };

  const saveAttendance = (groupId, date, records) => {
    setAttendance((prev) => {
      const existing = prev.find(
        (a) => a.groupId === groupId && a.date === date
      );
      if (existing) {
        return prev.map((a) =>
          a.id === existing.id ? { ...a, records } : a
        );
      }
      return [...prev, { id: uid("a"), groupId, date, records }];
    });
  };

  const updateMemberProgress = (progressId, patch) => {
    setProgress((prev) =>
      prev.map((p) => (p.id === progressId ? { ...p, ...patch } : p))
    );
  };

  const updateMemberHifzGoal = async (hifzAmount) => {
    const clean = String(hifzAmount || "").trim();
    if (!clean) {
      return { ok: false, error: "أدخل هدفك أولاً" };
    }
    if (!currentUser) {
      return { ok: false, error: "يجب تسجيل الدخول" };
    }

    if (currentUser.authId && isSupabaseConfigured()) {
      const sync = await updateMemberInfo(currentUser.authId, {
        hifzAmount: clean,
      });
      if (!sync.ok) {
        return sync;
      }
    }

    const patchUser = (user) =>
      user.id === currentUser.id ? { ...user, hifzAmount: clean } : user;

    setUsers((prev) => prev.map(patchUser));
    setCurrentUser((prev) => (prev ? { ...prev, hifzAmount: clean } : prev));
    return { ok: true, hifzAmount: clean };
  };

  const updateCurrentUserAvatar = (avatarUrl) => {
    if (!currentUser) return;
    const patchUser = (user) => {
      const isSelf =
        (currentUser.authId && user.authId === currentUser.authId) ||
        user.id === currentUser.id;
      return isSelf ? { ...user, avatarUrl: avatarUrl || null } : user;
    };
    setUsers((prev) => prev.map(patchUser));
    setCurrentUser((prev) =>
      prev ? { ...prev, avatarUrl: avatarUrl || null } : prev
    );
  };

  const updateCurrentUserProfile = (patch = {}) => {
    if (!currentUser) return;
    const next = {};
    if (patch.firstName !== undefined) next.firstName = patch.firstName || "";
    if (patch.lastName !== undefined) next.lastName = patch.lastName || "";
    if (patch.phone !== undefined) next.phone = patch.phone || null;
    if (patch.gender !== undefined) next.gender = patch.gender || "غير محدد";
    if (patch.birthDate !== undefined) next.birthDate = patch.birthDate || null;
    if (patch.school !== undefined) next.school = patch.school || null;
    if (patch.level !== undefined) next.level = patch.level || null;
    if (Object.keys(next).length === 0) return;
    const patchUser = (user) => {
      const isSelf =
        (currentUser.authId && user.authId === currentUser.authId) ||
        user.id === currentUser.id;
      return isSelf ? { ...user, ...next } : user;
    };
    setUsers((prev) => prev.map(patchUser));
    setCurrentUser((prev) => (prev ? { ...prev, ...next } : prev));
  };

  const getMemberPrograms = (memberId = currentUser?.id) =>
    memberPrograms
      .filter((p) => p.userId === memberId)
      .map(enrichMemberProgram);

  const persistMemberProgramRemote = async (row, saisonId) => {
    if (!isSupabaseConfigured() || !supabaseSession?.user?.id) {
      return { ok: true, skipped: true };
    }
    if (!saisonId) {
      return { ok: false, error: "لا يوجد موسم نشط حالياً" };
    }
    return upsertMemberProgram(row, saisonId);
  };

  const saveMemberProgram = async (program, memberId = currentUser?.id) => {
    if (!memberId) return { ok: false, error: "يجب تسجيل الدخول" };
    const activeSeasonId = getActiveRegularSeason(seasons)?.id || null;
    if (!activeSeasonId) {
      return { ok: false, error: "لا يوجد موسم نشط حالياً" };
    }
    const title = String(program.title || "").trim();
    const nbHizb = Number(program.nbHizb);
    const durationDays = Number(program.durationDays);
    if (!title) return { ok: false, error: "أدخل اسم البرنامج" };
    if (!Number.isFinite(nbHizb) || nbHizb <= 0) {
      return { ok: false, error: "أدخل عدد أحزاب صحيحاً" };
    }
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      return { ok: false, error: "أدخل مدة صحيحة بالأيام" };
    }

    const existing = memberPrograms.find(
      (p) => p.id === program.id && p.userId === memberId
    );
    const completedTumuns = clampTumuns(
      program.completedTumuns ?? existing?.completedTumuns ?? 0,
      nbHizb
    );

    const row = {
      id: program.id || uid("mp"),
      userId: memberId,
      title,
      nbHizb,
      durationDays,
      startDate: String(program.startDate || todayStr()).trim() || todayStr(),
      completedTumuns,
      type: normalizeProgramType(program.type ?? existing?.type),
    };

    const sync = await persistMemberProgramRemote(row, activeSeasonId);
    if (!sync.ok && !sync.skipped) {
      return { ok: false, error: sync.error || "تعذر حفظ البرنامج" };
    }

    // Remplace la ligne de même id (mise à jour fonctionnelle) : une réponse
    // reçue deux fois pour le même formulaire ne crée pas de doublon à l'écran.
    setMemberPrograms((prev) => {
      const exists = prev.some((p) => p.id === row.id);
      if (exists) {
        return prev.map((p) => (p.id === row.id ? { ...p, ...row } : p));
      }
      return [...prev, row];
    });
    return { ok: true, program: enrichMemberProgram(row) };
  };

  const deleteMemberProgram = async (programId, memberId = currentUser?.id) => {
    if (!memberId || !programId) {
      return { ok: false, error: "معرّف البرنامج مفقود" };
    }
    if (isSupabaseConfigured() && supabaseSession?.user?.id) {
      const sync = await deleteMemberProgramRemote(programId);
      if (!sync.ok && !sync.skipped) {
        return { ok: false, error: sync.error || "تعذر حذف البرنامج" };
      }
    }
    setMemberPrograms((prev) =>
      prev.filter((p) => !(p.id === programId && p.userId === memberId))
    );
    return { ok: true };
  };

  const setMemberProgramTumuns = async (
    programId,
    completedTumuns,
    memberId = currentUser?.id
  ) => {
    const target = memberPrograms.find(
      (p) => p.id === programId && p.userId === memberId
    );
    if (!target) return { ok: false, error: "البرنامج غير موجود" };
    const clamped = clampTumuns(completedTumuns, target.nbHizb);
    return saveMemberProgram({ ...target, completedTumuns: clamped }, memberId);
  };

  const adjustMemberProgramTumuns = async (
    programId,
    delta,
    memberId = currentUser?.id
  ) => {
    const target = memberPrograms.find(
      (p) => p.id === programId && p.userId === memberId
    );
    if (!target) return { ok: false, error: "البرنامج غير موجود" };
    const current = clampTumuns(target.completedTumuns ?? 0, target.nbHizb);
    const next = clampTumuns(current + Number(delta || 0), target.nbHizb);
    if (next === current) {
      return { ok: true, unchanged: true, program: enrichMemberProgram(target) };
    }
    return saveMemberProgram({ ...target, completedTumuns: next }, memberId);
  };

  const addProgressNote = (progressId, note) => {
    setProgress((prev) =>
      prev.map((p) =>
        p.id === progressId
          ? { ...p, notes: [...(p.notes || []), note] }
          : p
      )
    );
  };

  const addExamResult = ({
    memberId,
    groupId,
    seasonId,
    score,
    level,
    notes,
  }) => {
    const exam = {
      id: uid("e"),
      memberId,
      groupId,
      seasonId,
      score: Number(score),
      level,
      notes,
      date: todayStr(),
      status: "completed",
      title: level ? `نتيجة — ${level}` : "نتيجة اختبار",
    };
    setExams((prev) => [...prev, exam]);
    pushNotification({
      title: "نتيجة اختبار جديدة",
      body: `درجتك: ${score} — المستوى: ${level}`,
      audience: "user",
      userId: memberId,
      category: NOTIF_CATEGORY.TESTS,
    });
    return exam;
  };

  const createExam = ({
    title,
    description,
    date,
    groupId,
    memberIds,
    notifyMembers = true,
  }) => {
    const cleanTitle = (title || "").trim();
    const cleanDate = (date || "").trim();
    const ids = Array.isArray(memberIds)
      ? [...new Set(memberIds.filter(Boolean))]
      : [];

    if (!cleanTitle) return { ok: false, error: "أدخل عنوان الاختبار" };
    if (!cleanDate) return { ok: false, error: "أدخل تاريخ الاختبار" };
    if (ids.length === 0) {
      return { ok: false, error: "اختر عضواً واحداً على الأقل" };
    }

    const exam = {
      id: uid("e"),
      title: cleanTitle,
      description: (description || "").trim(),
      date: cleanDate,
      groupId: groupId || null,
      memberIds: ids,
      status: "planned",
      createdAt: new Date().toISOString(),
    };
    setExams((prev) => [exam, ...prev]);

    if (notifyMembers) {
      ids.forEach((memberId) => {
        pushNotification({
          title: "اختبار جديد",
          body: `${exam.title} — بتاريخ ${exam.date}`,
          audience: "user",
          userId: memberId,
          category: NOTIF_CATEGORY.TESTS,
        });
      });
    }

    return { ok: true, exam };
  };

  const cancelExam = (examId) => {
    const target = exams.find((e) => e.id === examId);
    if (!target) return { ok: false, error: "الاختبار غير موجود" };
    setExams((prev) =>
      prev.map((e) =>
        e.id === examId ? { ...e, status: "cancelled" } : e
      )
    );
    return { ok: true };
  };

  const markExamCompleted = (examId) => {
    const target = exams.find((e) => e.id === examId);
    if (!target) return { ok: false, error: "الاختبار غير موجود" };
    setExams((prev) =>
      prev.map((e) =>
        e.id === examId ? { ...e, status: "completed" } : e
      )
    );
    return { ok: true };
  };

  function pushNotification({
    title,
    body,
    audience = "all",
    userId = null,
    saisonId = null,
    category = null,
  }) {
    const resolvedCategory = inferNotificationCategory({
      title,
      category,
      audience,
    });
    const item = {
      id: uid("n"),
      title,
      body,
      audience,
      userId,
      saisonId: saisonId || null,
      category: resolvedCategory,
      createdAt: new Date().toISOString(),
      readBy: [],
    };
    setNotifications((prev) => [item, ...prev].slice(0, 100));
  }

  const getNotificationsForUser = (user = currentUser, options = {}) => {
    if (!user) return [];
    const scopeSeasonId =
      options.saisonId != null
        ? String(options.saisonId || "").trim() || null
        : null;
    const strictSeason = !!options.strictSeason;
    const sinceMs = (() => {
      if (!options.sinceIso) return null;
      const ms = new Date(options.sinceIso).getTime();
      return Number.isFinite(ms) ? ms : null;
    })();
    return notifications.filter((n) => {
      if (scopeSeasonId) {
        const nSeason = n.saisonId || null;
        if (nSeason && nSeason !== scopeSeasonId) return false;
        if (strictSeason && !nSeason) return false;
      }
      if (sinceMs != null) {
        const at = new Date(n.createdAt || 0).getTime();
        if (!Number.isFinite(at) || at < sinceMs) return false;
      }
      if (n.audience === "all") return true;
      if (n.audience === "user" && n.userId === user.id) return true;
      if (n.audience === "admin" && userHasRole(user, ROLES.ADMIN)) return true;
      if (n.audience === "members" && userHasRole(user, ROLES.MEMBER)) {
        return true;
      }
      if (
        n.audience === "supervisors" &&
        userHasRole(user, ROLES.SUPERVISOR)
      ) {
        return true;
      }
      return false;
    });
  };

  const notificationCategoryOf = (n) =>
    inferNotificationCategory({
      title: n?.title,
      category: n?.category,
      audience: n?.audience,
    });

  /**
   * Badges menu : compteurs par catégorie (non lus uniquement).
   * Admin : saison active si saisonId fourni ; sinon toutes.
   * Membre : passer saisonId + sinceIso (après inscription).
   */
  const getMenuBadgeCounts = (user = currentUser, options = {}) => {
    if (!user) return {};
    const list = getNotificationsForUser(user, options);
    const counts = {};
    for (const n of list) {
      const uidReader = user.id;
      if ((n.readBy || []).includes(uidReader)) continue;
      const cat = notificationCategoryOf(n);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  };

  const markNotificationRead = (notificationId, userId = currentUser?.id) => {
    if (!userId) return;
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId && !n.readBy.includes(userId)
          ? { ...n, readBy: [...n.readBy, userId] }
          : n
      )
    );
  };

  /** Marque comme lues toutes les notifs d'une catégorie visibles pour l'utilisateur. */
  const markCategoryNotificationsRead = (
    category,
    user = currentUser,
    options = {}
  ) => {
    if (!user?.id || !category) return;
    const visibleIds = new Set(
      getNotificationsForUser(user, options).map((n) => n.id)
    );
    setNotifications((prev) =>
      prev.map((n) => {
        if (!visibleIds.has(n.id)) return n;
        if (notificationCategoryOf(n) !== category) return n;
        if ((n.readBy || []).includes(user.id)) return n;
        return { ...n, readBy: [...(n.readBy || []), user.id] };
      })
    );
  };

  const getUserById = (id) => users.find((u) => u.id === id);

  const getSupervisors = () =>
    users.filter((u) => userHasRole(u, ROLES.SUPERVISOR));

  const getMemberGroup = (memberId, seasonId) =>
    groups.find(
      (g) =>
        g.memberIds.includes(memberId) &&
        (!seasonId || g.seasonId === seasonId)
    );

  const getMemberProgress = (memberId, seasonId) =>
    progress.find(
      (p) =>
        p.memberId === memberId && (!seasonId || p.seasonId === seasonId)
    );

  const getSupervisorGroups = (supervisorId) =>
    groups.filter((g) => g.supervisorId === supervisorId);

  const stats = useMemo(() => {
    const activeSeason = getActiveRegularSeason(seasons);
    const pendingRegs = registrations.filter(
      (r) =>
        r.status === REGISTRATION_STATUS.PENDING &&
        (!activeSeason || !r.seasonId || r.seasonId === activeSeason.id)
    ).length;
    return { pendingRegs };
  }, [registrations, seasons]);

  const value = {
    hydrated,
    currentUser,
    supabaseSession,
    users,
    seasons,
    registrations,
    groups,
    progress,
    attendance,
    exams,
    notifications,
    stats,
    isSupabaseConfigured: isSupabaseConfigured(),
    login,
    logout,
    isLoggingOut,
    offlineRestored,
    confirmCurrentPassword,
    refreshCurrentUser,
    resetToSeedData,
    registerAccount,
    submitMemberApplication,
    activateInvite,
    activateSupervisorAccount,
    resetPassword,
    startNewSeason,
    submitSeasonRegistration,
    refreshRegistrations,
    reviewRegistration,
    createGroup,
    updateGroup,
    deleteGroup,
    assignMemberToGroup,
    assignSupervisorToGroup,
    addSupervisor,
    removeSupervisor,
    addMember,
    saveAttendance,
    updateMemberProgress,
    updateMemberHifzGoal,
    updateCurrentUserAvatar,
    updateCurrentUserProfile,
    getMemberPrograms,
    retryMemberProgramsSync,
    saveMemberProgram,
    deleteMemberProgram,
    setMemberProgramTumuns,
    adjustMemberProgramTumuns,
    addProgressNote,
    addExamResult,
    createExam,
    cancelExam,
    markExamCompleted,
    getNotificationsForUser,
    getMenuBadgeCounts,
    markNotificationRead,
    markCategoryNotificationsRead,
    getUserById,
    getSupervisors,
    getMemberGroup,
    getMemberProgress,
    getActiveRegularSeason: () => getActiveRegularSeason(seasons),
    getSupervisorGroups,
  };

  if (!hydrated) {
    return (
      <View style={bootStyles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const bootStyles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
});

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within AppProvider");
  }
  return ctx;
}
