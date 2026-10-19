import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentAuthId } from "./currentAuth";
import { isOffline, probeServer } from "./networkState";
import { USER_ERROR_MESSAGES } from "./userError";

/**
 * Cache de consultation hors ligne, par utilisateur et versionné.
 *
 * Clé    : cache:v1:<authId>:<ressource>
 *          ressource préfixée par le rôle : mem. | sup. | adm. | common.
 * Valeur : { savedAt: ISO, data }
 * Pointeur : cache:v1:lastAuthId (dernier compte dont le profil a été lu en ligne).
 *
 * Le serveur reste la source de vérité : ce cache n'est jamais renvoyé au serveur.
 * AsyncStorage n'est pas chiffré : n'y mettre que des données consultables
 * par le compte lui-même (voir l'audit pour les exclusions admin).
 */

const CACHE_PREFIX = "cache:v1:";
const LAST_AUTH_ID_KEY = `${CACHE_PREFIX}lastAuthId`;
const RESOURCE_RE = /^(mem|sup|adm|common)\.[A-Za-z0-9_.:-]+$/;

/** Incrémenté à chaque purge : une écriture lancée avant est abandonnée. */
let cacheEpoch = 0;

function cacheKey(authId, resource) {
  return `${CACHE_PREFIX}${authId}:${resource}`;
}

function isValidResource(resource) {
  const ok = RESOURCE_RE.test(String(resource || ""));
  if (!ok && __DEV__) {
    console.warn(`[cache] ressource invalide (préfixe mem./sup./adm./common.) : ${resource}`);
  }
  return ok;
}

/** @returns {Promise<{ savedAt: string, data: any } | null>} */
export async function readCache(authId, resource) {
  if (!authId || !isValidResource(resource)) return null;
  const key = cacheKey(authId, resource);
  try {
    const raw = await AsyncStorage.getItem(key);
    const entry = raw ? JSON.parse(raw) : null;
    const hit = !!entry && typeof entry.savedAt === "string" && "data" in entry;
    if (__DEV__) console.log(`[cache] read ${key} fromCache: ${hit}`);
    return hit ? entry : null;
  } catch {
    return null;
  }
}

/** @returns {Promise<string|null>} savedAt écrit, ou null en cas d'échec */
export async function writeCache(authId, resource, data) {
  if (!authId || !isValidResource(resource)) return null;
  const key = cacheKey(authId, resource);
  const savedAt = new Date().toISOString();
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ savedAt, data }));
    if (__DEV__) console.log(`[cache] write ${key} fromCache: false`);
    return savedAt;
  } catch (e) {
    console.warn("[cache] write:", e?.message || e);
    return null;
  }
}

async function removeKeysWithPrefix(prefix) {
  const keys = await AsyncStorage.getAllKeys();
  const targets = keys.filter((key) => key.startsWith(prefix));
  if (targets.length > 0) await AsyncStorage.multiRemove(targets);
  return targets.length;
}

/** Supprime toutes les clés cache:v1:<authId>:. */
export async function purgeUserCache(authId) {
  if (!authId) return 0;
  cacheEpoch += 1;
  try {
    return await removeKeysWithPrefix(cacheKey(authId, ""));
  } catch (e) {
    console.warn("[cache] purgeUserCache:", e?.message || e);
    return 0;
  }
}

/** Supprime tout le cache hors ligne, pointeur lastAuthId compris. */
export async function purgeAllOfflineCache() {
  cacheEpoch += 1;
  try {
    return await removeKeysWithPrefix(CACHE_PREFIX);
  } catch (e) {
    console.warn("[cache] purgeAllOfflineCache:", e?.message || e);
    return 0;
  }
}

export async function readLastAuthId() {
  try {
    return (await AsyncStorage.getItem(LAST_AUTH_ID_KEY)) || null;
  } catch {
    return null;
  }
}

export async function writeLastAuthId(authId) {
  if (!authId) return;
  try {
    await AsyncStorage.setItem(LAST_AUTH_ID_KEY, String(authId));
  } catch (e) {
    console.warn("[cache] lastAuthId:", e?.message || e);
  }
}

/** Résultat servi par le cache, ou inconnu faute de réseau : à recharger au retour en ligne. */
export function servedOffline(res) {
  return !!(res && (res.fromCache || res.offline));
}

/** Champs ajoutés par cachedFetch : jamais écrits dans le cache. */
function stripCacheMeta(result) {
  const { fromCache: _f, savedAt: _s, offline: _o, ...rest } = result || {};
  return rest;
}

function fromCacheResult(entry) {
  return {
    ...(entry.data || {}),
    ok: true,
    fromCache: true,
    savedAt: entry.savedAt,
  };
}

/**
 * Lecture avec repli sur le cache en cas d'erreur RÉSEAU uniquement.
 *
 * Contrat : `fetcher` est une fonction des *Api.js qui renvoie
 * `{ ok: boolean, error?: string, skipped?: boolean, ...champs }`.
 * Le résultat garde ce format, avec en plus :
 *   - fromCache: boolean (toujours présent)
 *   - savedAt: ISO (seulement si fromCache)
 *   - offline: true (seulement si hors ligne sans cache ; ok: false)
 *
 * 1. État déjà hors ligne : cache servi sans requête, sonde relancée en
 *    arrière-plan. Pas de cache → { ok:false, error, offline:true }.
 * 2. Sinon `fetcher()` :
 *    - ok → résultat écrit dans le cache (même vide), renvoyé fromCache:false ;
 *    - skipped (aucune requête faite) → renvoyé tel quel, ni cache ni sonde ;
 *    - échec (ou exception) → sonde :
 *        en ligne  → erreur d'origine, SANS cache (RLS, trigger, métier) ;
 *        hors ligne → cache (fromCache:true) ou erreur + offline:true.
 *
 * Option `toCache(result)` : version réduite écrite dans le cache (ex. lignes
 * affichées seulement). Le résultat renvoyé à l'écran reste complet.
 *
 * @param {string} resource ex. "mem.programs", "sup.seanceMembers.<id>"
 * @param {() => Promise<object>} fetcher
 * @param {{ toCache?: (result: object) => object }} [options]
 */
export async function cachedFetch(resource, fetcher, { toCache } = {}) {
  const authId = await getCurrentAuthId();
  const cacheable = !!authId && isValidResource(resource);
  const epoch = cacheEpoch;

  if (cacheable && isOffline()) {
    probeServer();
    const cached = await readCache(authId, resource);
    if (cached) return fromCacheResult(cached);
    return {
      ok: false,
      error: USER_ERROR_MESSAGES.network,
      offline: true,
      fromCache: false,
    };
  }

  let result;
  try {
    result = await fetcher();
  } catch (e) {
    result = { ok: false, error: e?.message || USER_ERROR_MESSAGES.unknown };
  }
  result = result && typeof result === "object" ? result : { ok: false };

  if (result.ok) {
    // Pas d'écriture si le compte a changé ou si le cache a été purgé entre-temps.
    if (cacheable && epoch === cacheEpoch && (await getCurrentAuthId()) === authId) {
      const stored = typeof toCache === "function" ? toCache(result) : result;
      await writeCache(authId, resource, stripCacheMeta(stored));
    }
    return { ...result, fromCache: false };
  }
  if (result.skipped || !cacheable) {
    return { ...result, fromCache: false };
  }

  const reachable = await probeServer();
  if (reachable) return { ...result, fromCache: false };
  const cached = await readCache(authId, resource);
  if (cached) return fromCacheResult(cached);
  return { ...result, ok: false, offline: true, fromCache: false };
}
