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
 * Budget : 2 Mo pour les clés cache:v1:<authId>:* (la base Android fait 6 Mo et
 * contient aussi la session Supabase et app_state_v3). Index des tailles dans
 * cache:v1:__index ; les clés les plus anciennes (savedAt) sont supprimées
 * pour rester sous le budget, sauf common.profile (démarrage hors ligne).
 *
 * Le serveur reste la source de vérité : ce cache n'est jamais renvoyé au serveur.
 * AsyncStorage n'est pas chiffré : n'y mettre que des données consultables
 * par le compte lui-même (voir l'audit pour les exclusions admin).
 */

const CACHE_PREFIX = "cache:v1:";
const LAST_AUTH_ID_KEY = `${CACHE_PREFIX}lastAuthId`;
const INDEX_KEY = `${CACHE_PREFIX}__index`;
const RESOURCE_RE = /^(mem|sup|adm|common)\.[A-Za-z0-9_.:-]+$/;

/** Budget des clés d'un compte (octets UTF-8, clé + valeur). */
const CACHE_BUDGET_BYTES = 2 * 1024 * 1024;
/** Ressources jamais supprimées pour le budget. */
const PROTECTED_RESOURCES = new Set(["common.profile"]);
/** Clés des versions précédentes (lots 2 et 3), remplacées par une clé fusionnée. */
const LEGACY_KEY_RES = [
  /:mem\.progress\.recent\./,
  /:sup\.member\.[^.]+\.(history|recentHistory)$/,
];

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

/* ------------------------------ Index et budget ------------------------------ */

/** Taille UTF-8 (SQLite stocke le texte en UTF-8 ; l'arabe prend 2 octets). */
function utf8ByteLength(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

function isIndexedKey(key) {
  return key.startsWith(CACHE_PREFIX) && key !== INDEX_KEY && key !== LAST_AUTH_ID_KEY;
}

/**
 * Jamais supprimée pour le budget : lastAuthId, __index (hors index, garde
 * redondante) et common.profile (démarrage hors ligne).
 */
function isProtectedKey(key) {
  if (!isIndexedKey(key)) return true;
  const resource = key.slice(key.indexOf(":", CACHE_PREFIX.length) + 1);
  return PROTECTED_RESOURCES.has(resource);
}

/** Index en mémoire : { [clé]: { size, savedAt } }. Chargé une fois par session. */
let indexEntries = null;
let indexLock = Promise.resolve();

/** Une opération sur l'index à la fois (écritures concurrentes de cachedFetch). */
function withIndexLock(task) {
  const run = indexLock.then(task, task);
  indexLock = run.catch(() => {});
  return run;
}

async function persistIndex() {
  try {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify({ v: 1, entries: indexEntries }));
  } catch (e) {
    // Index non écrit : reconstruit au prochain lancement (incohérent).
    console.warn("[cache] index:", e?.message || e);
  }
}

function sumBytes(prefix) {
  let total = 0;
  Object.keys(indexEntries).forEach((key) => {
    if (key.startsWith(prefix)) total += indexEntries[key].size || 0;
  });
  return total;
}

/** Index depuis les valeurs stockées (premier lancement, ancienne version, incohérence). */
async function rebuildIndex(keys) {
  const entries = {};
  const pairs = keys.length > 0 ? await AsyncStorage.multiGet(keys) : [];
  pairs.forEach(([key, value]) => {
    if (value == null) return;
    let savedAt = null;
    try {
      savedAt = JSON.parse(value)?.savedAt || null;
    } catch {
      savedAt = null;
    }
    entries[key] = { size: utf8ByteLength(key) + utf8ByteLength(value), savedAt };
  });
  return entries;
}

/**
 * Charge l'index (à appeler sous withIndexLock). Supprime d'abord les clés des
 * versions précédentes ; index absent ou différent des clés réelles → reconstruit.
 */
async function loadIndex() {
  if (indexEntries) return indexEntries;
  let keys = (await AsyncStorage.getAllKeys()).filter(isIndexedKey);
  const legacy = keys.filter((key) => LEGACY_KEY_RES.some((re) => re.test(key)));
  if (legacy.length > 0) {
    await AsyncStorage.multiRemove(legacy);
    keys = keys.filter((key) => !legacy.includes(key));
    if (__DEV__) console.log(`[cache] ${legacy.length} clé(s) d'une ancienne version supprimée(s)`);
  }
  let stored = null;
  try {
    stored = JSON.parse((await AsyncStorage.getItem(INDEX_KEY)) || "null");
  } catch {
    stored = null;
  }
  const storedEntries = stored?.v === 1 && stored.entries ? stored.entries : null;
  const consistent =
    storedEntries &&
    Object.keys(storedEntries).length === keys.length &&
    keys.every((key) => storedEntries[key] && Number.isFinite(storedEntries[key].size));
  if (consistent) {
    indexEntries = storedEntries;
  } else {
    indexEntries = await rebuildIndex(keys);
    await persistIndex();
    if (__DEV__) console.log(`[cache] index reconstruit : ${keys.length} clé(s)`);
  }
  return indexEntries;
}

/**
 * Supprime les clés évictables les plus anciennes (savedAt) de `prefix` jusqu'à
 * libérer `needBytes`. Jamais `keepKey` ni une clé protégée (isProtectedKey).
 * @returns {Promise<number>} octets libérés
 */
async function evictOldest(prefix, keepKey, needBytes, reason) {
  const candidates = Object.keys(indexEntries)
    .filter((key) => key.startsWith(prefix) && key !== keepKey && !isProtectedKey(key))
    .sort((a, b) =>
      String(indexEntries[a].savedAt || "").localeCompare(String(indexEntries[b].savedAt || ""))
    );
  const victims = [];
  let freed = 0;
  for (const key of candidates) {
    if (freed >= needBytes) break;
    victims.push(key);
    freed += indexEntries[key].size || 0;
  }
  if (victims.length === 0) return 0;
  await AsyncStorage.multiRemove(victims);
  victims.forEach((key) => {
    delete indexEntries[key];
  });
  if (__DEV__) {
    console.log(
      `[cache] ${reason} : ${victims.length} clé(s) supprimée(s) (${Math.round(freed / 1024)} Ko)`,
      victims.map((key) => key.slice(key.indexOf(":", CACHE_PREFIX.length) + 1))
    );
  }
  return freed;
}

/** Supprime les clés `prefix` de l'index et du stockage (purges). */
async function removeKeysWithPrefix(prefix) {
  return withIndexLock(async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
    if (indexEntries) {
      keys.forEach((key) => {
        delete indexEntries[key];
      });
      if (keys.includes(INDEX_KEY)) indexEntries = null;
      else if (keys.length > 0) await persistIndex();
    }
    return keys.filter(isIndexedKey).length;
  });
}

/* --------------------------------- Lecture / écriture --------------------------------- */

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

/**
 * Écrit sous le budget : supprime d'abord les clés les plus anciennes si
 * nécessaire ; stockage plein → libère les plus anciennes et réessaie une fois.
 * Un échec abandonne l'écriture (l'écran garde le résultat serveur).
 * @returns {Promise<string|null>} savedAt écrit, ou null en cas d'échec
 */
export function writeCache(authId, resource, data) {
  return writeCacheQueued(authId, resource, { build: () => data });
}

/**
 * Écriture dans la file sérialisée de l'index.
 * - `build(previousData)` calcule la valeur au moment de l'écriture (fusion avec
 *   le cache précédent si `mergePrevious`).
 * - `epoch` fourni (cachedFetch) : abandon si une purge a eu lieu ou si le compte
 *   a changé depuis la requête, attente dans la file comprise.
 * Ne lève jamais : un échec renvoie null.
 * @returns {Promise<string|null>} savedAt écrit, ou null
 */
function writeCacheQueued(authId, resource, { build, mergePrevious = false, epoch = null }) {
  if (!authId || !isValidResource(resource)) return Promise.resolve(null);
  const key = cacheKey(authId, resource);
  const userPrefix = cacheKey(authId, "");

  return withIndexLock(async () => {
    // Index modifié (suppressions ou écriture) : réécrit même si l'écriture est abandonnée.
    let indexChanged = false;
    try {
      if (epoch != null && (epoch !== cacheEpoch || (await getCurrentAuthId()) !== authId)) {
        if (__DEV__) console.log(`[cache] write ${resource} abandonnée (compte changé ou purge)`);
        return null;
      }
      const previous = mergePrevious ? (await readCache(authId, resource))?.data : undefined;
      const savedAt = new Date().toISOString();
      const value = JSON.stringify({ savedAt, data: build(previous) });
      const size = utf8ByteLength(key) + utf8ByteLength(value);

      await loadIndex();
      if (size > CACHE_BUDGET_BYTES) {
        console.warn(`[cache] write ${resource} : ${Math.round(size / 1024)} Ko > budget, abandon`);
        return null;
      }
      const others = sumBytes(userPrefix) - (indexEntries[key]?.size || 0);
      const overflow = others + size - CACHE_BUDGET_BYTES;
      if (overflow > 0) {
        indexChanged = (await evictOldest(userPrefix, key, overflow, "budget")) > 0;
        const after = sumBytes(userPrefix) - (indexEntries[key]?.size || 0);
        if (after + size > CACHE_BUDGET_BYTES) {
          console.warn(`[cache] write ${resource} : budget impossible à libérer, abandon`);
          return null;
        }
      }

      try {
        await AsyncStorage.setItem(key, value);
      } catch (firstError) {
        // Stockage plein malgré le budget : on libère les plus anciennes, un seul nouvel essai.
        const freed = await evictOldest(userPrefix, key, size, "stockage plein");
        if (freed <= 0) throw firstError;
        indexChanged = true;
        await AsyncStorage.setItem(key, value);
      }

      indexEntries[key] = { size, savedAt };
      indexChanged = true;
      if (__DEV__) {
        console.log(
          `[cache] write ${key} fromCache: false — total ${Math.round(
            sumBytes(userPrefix) / 1024
          )} Ko / ${CACHE_BUDGET_BYTES / 1024} Ko`
        );
      }
      return savedAt;
    } catch (e) {
      console.warn("[cache] write:", e?.message || e);
      return null;
    } finally {
      if (indexChanged && indexEntries) await persistIndex();
    }
  });
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

/**
 * Rôle retiré côté serveur : supprime cache:v1:<authId>:<role>.* (role = "sup" | "adm").
 * @returns {Promise<number>} nombre de clés supprimées
 */
export async function purgeRoleCache(authId, rolePrefix) {
  if (!authId || (rolePrefix !== "sup" && rolePrefix !== "adm")) return 0;
  try {
    const removed = await removeKeysWithPrefix(cacheKey(authId, `${rolePrefix}.`));
    if (removed > 0) {
      cacheEpoch += 1;
      if (__DEV__) {
        console.log(`[cache] rôle retiré : ${removed} clé(s) ${rolePrefix}.* supprimée(s)`);
      }
    }
    return removed;
  } catch (e) {
    console.warn("[cache] purgeRoleCache:", e?.message || e);
    return 0;
  }
}

/** Supprime tout le cache hors ligne, pointeur lastAuthId et index compris. */
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

/** Donnée inconnue hors ligne (échec sans cache). */
export const OFFLINE_UNAVAILABLE_MESSAGE = "غير متاح دون اتصال";

/** Texte d'une donnée inconnue : hors ligne → message fixe ; en ligne → erreur actuelle. */
export function unknownDataMessage(res, fallback) {
  if (res?.offline) return OFFLINE_UNAVAILABLE_MESSAGE;
  return res?.error || fallback || USER_ERROR_MESSAGES.unknown;
}

/** Segment de clé autorisé par la ressource ([A-Za-z0-9_:-], "." réservé aux séparateurs). */
export function cacheKeySegment(value) {
  const raw = value == null || value === "" ? "none" : String(value);
  return raw.replace(/[^A-Za-z0-9_:-]/g, "_");
}

/* ------------------------- Lignes de progression allégées ------------------------- */

/**
 * Colonnes de `progression` utilisées par les écrans et les calculs
 * (computeProgressMetrics, rythme, grille d'activité, listes, filtre de saison).
 */
const PROGRESS_CACHE_COLUMNS = [
  "id",
  "date",
  "date_saisie",
  "created_at",
  "saison_id",
  "nb_hizb_completes",
  "tumun_courant",
  "notes",
];

/** Ligne de progression réduite aux colonnes utiles (cache seulement). */
export function compactProgressRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  PROGRESS_CACHE_COLUMNS.forEach((col) => {
    if (row[col] !== undefined && row[col] !== null) out[col] = row[col];
  });
  return out;
}

/** toCache d'une position ({ entry, metrics }) : ligne allégée. */
export function compactPositionForCache(result) {
  if (!result?.entry) return result;
  return { ...result, entry: compactProgressRow(result.entry) };
}

function progressEntryDateMs(entry) {
  const t = new Date(
    String(entry?.date || entry?.date_saisie || entry?.created_at || "")
  ).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Tri serveur : `date` décroissante, puis `id` décroissant. */
function sortProgressDesc(entries) {
  return [...entries].sort((a, b) => {
    const d = progressEntryDateMs(b) - progressEntryDateMs(a);
    if (d !== 0) return d;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

/** `cap - 1` lignes les plus récentes + la plus ancienne de la saison (delta de saison exact). */
function capProgressEntries(sortedDesc, cap, saisonId) {
  if (sortedDesc.length <= cap) return sortedDesc;
  const kept = sortedDesc.slice(0, cap - 1);
  const sid = saisonId == null ? "" : String(saisonId);
  const ofSeason = sid
    ? sortedDesc.filter((e) => e?.saison_id != null && String(e.saison_id) === sid)
    : [];
  const oldest = ofSeason.length > 0 ? ofSeason[ofSeason.length - 1] : sortedDesc[cap - 1];
  if (!kept.includes(oldest)) kept.push(oldest);
  return kept;
}

/**
 * Historique de progression fusionné dans UNE clé (toCache avec cache précédent).
 * - Requête complète (sans `since`) : le serveur remplace tout.
 * - Requête bornée (`since`, `limit`) : le serveur remplace la fenêtre couverte ;
 *   les lignes plus anciennes du cache sont gardées.
 * Lignes allégées, dédoublonnées par id, au plus `cap` (avec la plus ancienne
 * de la saison).
 */
export function mergeProgressHistoryForCache(
  result,
  previous,
  { cap, saisonId = null, since = null, limit = null }
) {
  const fresh = (result?.entries || []).map(compactProgressRow);
  let merged = fresh;
  const previousEntries = Array.isArray(previous?.entries) ? previous.entries : [];
  if (since && previousEntries.length > 0) {
    let lowerMs = new Date(since).getTime();
    if (!Number.isFinite(lowerMs)) lowerMs = 0;
    // Limite atteinte : seule la plage depuis la plus ancienne ligne reçue est couverte.
    if (limit && fresh.length >= limit) {
      lowerMs = Math.max(lowerMs, Math.min(...fresh.map(progressEntryDateMs)));
    }
    const freshIds = new Set(fresh.map((e) => e?.id));
    const older = previousEntries.filter(
      (e) => !freshIds.has(e?.id) && progressEntryDateMs(e) < lowerMs
    );
    merged = [...fresh, ...older];
  }
  return {
    ...result,
    entries: capProgressEntries(sortProgressDesc(merged), cap, saisonId),
  };
}

/** Lignes servies du cache, ramenées à la fenêtre d'une requête bornée. */
export function filterProgressEntriesSince(entries, since, limit = null) {
  const lowerMs = since ? new Date(since).getTime() : NaN;
  const inWindow = Number.isFinite(lowerMs)
    ? (entries || []).filter((e) => progressEntryDateMs(e) >= lowerMs)
    : entries || [];
  return limit ? inWindow.slice(0, limit) : inWindow;
}

/**
 * Lecture JAMAIS mise en cache (données exclues : demandes d'inscription, notes,
 * statistiques, invitations…).
 * - État déjà hors ligne : aucune requête, { ok:false, offline:true } tout de suite
 *   (pas d'attente du délai réseau), sonde relancée en arrière-plan.
 * - Échec : sonde ; serveur injoignable → offline:true, sinon erreur d'origine.
 * @param {() => Promise<object>} fetcher
 */
export async function fetchOnlineOnly(fetcher) {
  if (isOffline()) {
    probeServer();
    return { ok: false, error: USER_ERROR_MESSAGES.network, offline: true };
  }
  let result;
  try {
    result = await fetcher();
  } catch (e) {
    result = { ok: false, error: e?.message || USER_ERROR_MESSAGES.unknown };
  }
  result = result && typeof result === "object" ? result : { ok: false };
  if (result.ok || result.skipped) return result;
  if (await probeServer()) return result;
  return { ...result, ok: false, offline: true };
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
 *    - ok → renvoyé tout de suite (fromCache:false) ; écrit dans le cache (même
 *      vide) en arrière-plan, dans la file sérialisée ;
 *    - skipped (aucune requête faite) → renvoyé tel quel, ni cache ni sonde ;
 *    - échec (ou exception) → sonde :
 *        en ligne  → erreur d'origine, SANS cache (RLS, trigger, métier) ;
 *        hors ligne → cache (fromCache:true) ou erreur + offline:true.
 *
 * Option `toCache(result, previousData)` : version écrite dans le cache (lignes
 * allégées, fusion). `previousData` n'est lu que si `mergePrevious: true`.
 * Le résultat renvoyé à l'écran reste complet.
 *
 * @param {string} resource ex. "mem.programs", "sup.seanceMembers.<id>"
 * @param {() => Promise<object>} fetcher
 * @param {{ toCache?: (result: object, previous?: object) => object, mergePrevious?: boolean }} [options]
 */
export async function cachedFetch(resource, fetcher, { toCache, mergePrevious = false } = {}) {
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
    // Écriture du cache en arrière-plan : le résultat serveur est renvoyé tout de suite.
    // La file vérifie au moment d'écrire que ni purge ni changement de compte n'ont
    // eu lieu (pendant la requête ou l'attente) ; les erreurs sont attrapées.
    if (cacheable && epoch === cacheEpoch) {
      // Contenu figé dès la mise en file (sérialisation synchrone) : l'écran peut
      // modifier le résultat reçu sans altérer ce qui sera écrit.
      let frozen = null;
      try {
        frozen = JSON.stringify(result);
      } catch (e) {
        console.warn("[cache] write (arrière-plan) :", e?.message || e);
      }
      if (frozen != null) {
        writeCacheQueued(authId, resource, {
          epoch,
          mergePrevious,
          build: (previous) => {
            const snapshot = JSON.parse(frozen);
            return stripCacheMeta(
              typeof toCache === "function" ? toCache(snapshot, previous) : snapshot
            );
          },
        }).catch((e) => console.warn("[cache] write (arrière-plan):", e?.message || e));
      }
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
