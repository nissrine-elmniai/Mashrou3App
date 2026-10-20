import { AppState } from "react-native";

/**
 * Joignabilité du serveur Supabase, en JavaScript pur (pas de NetInfo).
 *
 * - Sonde : GET <url>/auth/v1/health, 4 s max.
 *   Échec de transport ou délai dépassé → hors ligne.
 *   Toute réponse HTTP (même 401, 404, 500) → en ligne : le serveur répond.
 * - Une seule sonde à la fois : un appel pendant une sonde reçoit la même promesse.
 * - Hors ligne : nouvelle sonde au retour au premier plan et toutes les 30 s.
 *   En ligne : aucune sonde périodique.
 * - Le fetch du client Supabase (supabase.js) signale les échecs de transport
 *   et les réponses reçues pendant un état hors ligne.
 *
 * La sonde utilise le fetch global, jamais le fetch instrumenté : pas de boucle.
 * Une réponse d'un portail captif (Wi-Fi public) compte comme « en ligne ».
 */

const PROBE_TIMEOUT_MS = 4000;
const OFFLINE_RETRY_MS = 30000;

let probeUrl = null;
let offline = false;
let probeInFlight = null;
let retryTimer = null;
let appStateSub = null;
const listeners = new Set();
const backOnlineListeners = new Set();

/** Appelé une fois par supabase.js avec l'URL du projet. */
export function configureProbe(baseUrl) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  probeUrl = base ? `${base}/auth/v1/health` : null;
}

/** URL de la sonde (exclue de l'instrumentation du fetch Supabase). */
export function getProbeUrl() {
  return probeUrl;
}

export function isOffline() {
  return offline;
}

/**
 * Écoute les CHANGEMENTS d'état (pas chaque sonde).
 * @param {(offline: boolean) => void} listener
 * @returns {() => void} désabonnement
 */
export function subscribe(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Événement « retour en ligne » : passage hors ligne → en ligne uniquement.
 * @returns {() => void} désabonnement
 */
export function onBackOnline(listener) {
  if (typeof listener !== "function") return () => {};
  backOnlineListeners.add(listener);
  return () => backOnlineListeners.delete(listener);
}

function notify(set, ...args) {
  set.forEach((listener) => {
    try {
      listener(...args);
    } catch (e) {
      console.warn("[network] listener:", e?.message || e);
    }
  });
}

function startOfflineWatch() {
  if (!retryTimer) {
    retryTimer = setInterval(() => {
      probeServer();
    }, OFFLINE_RETRY_MS);
  }
  if (!appStateSub) {
    appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && offline) probeServer();
    });
  }
}

function stopOfflineWatch() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
}

function setOffline(next) {
  if (offline === next) return;
  offline = next;
  if (offline) startOfflineWatch();
  else stopOfflineWatch();
  notify(listeners, offline);
  if (!offline) notify(backOnlineListeners);
}

/**
 * Sonde de joignabilité.
 * @returns {Promise<boolean>} true si le serveur a répondu (en ligne)
 */
export function probeServer() {
  if (probeInFlight) return probeInFlight;
  if (!probeUrl) return Promise.resolve(!offline);
  const startedAt = Date.now();
  probeInFlight = (async () => {
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    let timer = null;
    let reachable = false;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller?.abort();
          reject(new Error("probe timeout"));
        }, PROBE_TIMEOUT_MS);
      });
      await Promise.race([
        fetch(probeUrl, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
          ...(controller ? { signal: controller.signal } : {}),
        }),
        timeout,
      ]);
      reachable = true;
    } catch {
      reachable = false;
    } finally {
      clearTimeout(timer);
    }
    if (__DEV__) {
      console.log(
        `[network] sonde : ${reachable ? "en ligne" : "hors ligne"} (${Date.now() - startedAt} ms)`
      );
    }
    setOffline(!reachable);
    return reachable;
  })().finally(() => {
    probeInFlight = null;
  });
  return probeInFlight;
}

/** fetch Supabase : échec de transport → sonde en arrière-plan (réutilise la sonde en cours). */
export function reportTransportFailure() {
  probeServer();
}

/** fetch Supabase : réponse HTTP reçue alors que l'état est hors ligne → sonde de confirmation. */
export function reportHttpResponse() {
  if (offline) probeServer();
}
