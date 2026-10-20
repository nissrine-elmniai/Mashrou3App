import { isOffline, subscribe as subscribeNetwork } from "./networkState";

/**
 * Messages courts (toast) : émetteur de module, affichés par AppToast (App.js).
 * Un nouveau message remplace celui affiché, sans empilement.
 */

export const NETWORK_OFFLINE_MESSAGE =
  "غير متصل بالإنترنت — يتم عرض آخر البيانات المحفوظة";
export const NETWORK_ONLINE_MESSAGE = "عاد الاتصال بالإنترنت";
export const REQUIRE_ONLINE_MESSAGE = "هذا الإجراء يتطلب اتصالاً بالإنترنت";

/** Au plus un message de changement de réseau toutes les 10 s. */
const NETWORK_TOAST_MIN_INTERVAL_MS = 10000;

const listeners = new Set();
let lastToast = null;
let toastSeq = 0;
let lastNetworkToastAt = 0;

/** @param {string} message */
export function showToast(message) {
  const text = String(message || "").trim();
  if (!text) return;
  toastSeq += 1;
  lastToast = { id: toastSeq, message: text, shownAt: Date.now() };
  listeners.forEach((listener) => {
    try {
      listener(lastToast);
    } catch (e) {
      console.warn("[toast] listener:", e?.message || e);
    }
  });
}

/** Dernier message émis : AppToast l'affiche s'il est monté après l'émission. */
export function getLastToast() {
  return lastToast;
}

/** @returns {() => void} désabonnement */
export function subscribeToast(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Garde des actions d'écriture (à partir du lot 2) : hors ligne, toast et false.
 * Les boutons restent actifs (pas grisés).
 * @returns {boolean} true si l'action peut continuer
 */
export function requireOnline() {
  if (!isOffline()) return true;
  showToast(REQUIRE_ONLINE_MESSAGE);
  return false;
}

// networkState n'appelle ses abonnés que sur un CHANGEMENT d'état.
subscribeNetwork((offline) => {
  const now = Date.now();
  if (now - lastNetworkToastAt < NETWORK_TOAST_MIN_INTERVAL_MS) return;
  lastNetworkToastAt = now;
  showToast(offline ? NETWORK_OFFLINE_MESSAGE : NETWORK_ONLINE_MESSAGE);
});
