import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, SUPABASE_URL } from "./supabase";

/**
 * Identifiant du compte connecté, sans appel réseau.
 * Sert aux clés de cache et aux filtres côté client uniquement : les droits
 * restent vérifiés par le serveur (JWT + RLS).
 */

/** authId tenu par AppContext (connexion, restauration en ligne ou hors ligne). */
let authIdHint = null;

/** AppContext : connexion / restauration → authId ; purge → null. */
export function setCurrentAuthIdHint(authId) {
  authIdHint = authId || null;
}

/**
 * Clé de session de supabase-js. supabase.js ne fixe pas de storageKey :
 * on lit celle du client Auth, sinon la dérivation par défaut de
 * SupabaseClient (`sb-<premier label du host>-auth-token`).
 */
export function authSessionStorageKey() {
  const fromClient = supabase.auth?.storageKey;
  if (typeof fromClient === "string" && fromClient) return fromClient;
  return `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
}

function parseJson(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Id de la session telle qu'elle est stockée, jeton expiré compris.
 * Lecture directe d'AsyncStorage : pas de getSession() (il attend
 * l'initialisation d'auth-js, qui retente le rafraîchissement ~30 s hors ligne).
 * @returns {Promise<string|null>}
 */
export async function readStoredSessionUserId() {
  try {
    const key = authSessionStorageKey();
    const session = parseJson(await AsyncStorage.getItem(key));
    if (!session?.access_token && !session?.refresh_token) return null;
    if (session.user?.id) return String(session.user.id);
    // Variante userStorage d'auth-js : utilisateur rangé sous <clé>-user.
    const userEntry = parseJson(await AsyncStorage.getItem(`${key}-user`));
    return userEntry?.user?.id ? String(userEntry.user.id) : null;
  } catch {
    return null;
  }
}

/**
 * 1) authId tenu par AppContext ; 2) à défaut, id de la session stockée.
 * @returns {Promise<string|null>}
 */
export async function getCurrentAuthId() {
  if (authIdHint) return authIdHint;
  return readStoredSessionUserId();
}
