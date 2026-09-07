import { colors } from "../../constants/theme";
import { computeProgressMetrics } from "../../lib/progressApi";

/** Fenêtre de la grille d'activité (aujourd'hui inclus). */
export const ACTIVITY_DAY_COUNT = 90;
/** Plafond PostgREST pour l'historique d'un membre. */
export const HISTORY_FETCH_LIMIT = 200;

/**
 * Jour calendaire local depuis `progression.date` (timestamptz).
 * Ne pas utiliser `date_saisie`.
 */
export function localDayKeyFromDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Début de la fenêtre (minuit local, ACTIVITY_DAY_COUNT jours). */
export function historyWindowStart(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (ACTIVITY_DAY_COUNT - 1));
  return start;
}

export function historySinceIso(now = new Date()) {
  return historyWindowStart(now).toISOString();
}

/**
 * Clés jour, plus récent d'abord — premier élément = aujourd'hui
 * (côté début RTL via `row` de rtl.js).
 */
export function buildActivityDayKeysNewestFirst(now = new Date()) {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const keys = [];
  for (let i = 0; i < ACTIVITY_DAY_COUNT; i += 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    keys.push(localDayKeyFromDate(d));
  }
  return keys;
}

function rowTumunTotal(entry) {
  return computeProgressMetrics(entry)?.tumunTotal ?? 0;
}

/**
 * Dernière ligne de chaque jour (entries déjà triées date desc, id desc).
 */
function lastEntryByDay(entries) {
  const map = new Map();
  (entries || []).forEach((entry) => {
    const key = localDayKeyFromDate(entry?.date);
    if (!key || map.has(key)) return;
    map.set(key, entry);
  });
  return map;
}

function previousDayWithData(dayKey, lastBy) {
  const parts = String(dayKey || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const cursor = new Date(parts[0], parts[1] - 1, parts[2]);
  for (let step = 1; step < ACTIVITY_DAY_COUNT + 30; step += 1) {
    cursor.setDate(cursor.getDate() - 1);
    const prevKey = localDayKeyFromDate(cursor);
    if (prevKey && lastBy.has(prevKey)) {
      return lastBy.get(prevKey);
    }
  }
  return null;
}

/**
 * Palier d'intensité d'un delta net en أثمان (pas un décompte de lignes).
 * empty | recul | low (1–2) | mid (3–5) | high (6+)
 */
export function intensityKindFromDelta(delta, hasRows) {
  if (!hasRows) return "empty";
  if (delta == null) return "low";
  if (delta < 0) return "recul";
  if (delta === 0) return "empty";
  if (delta >= 6) return "high";
  if (delta >= 3) return "mid";
  return "low";
}

export function activityCellColor(kind) {
  if (kind === "recul") return colors.goldSoft;
  if (kind === "low") return colors.primarySoft;
  if (kind === "mid") return colors.borderGreen;
  if (kind === "high") return colors.primary;
  return colors.inputBg;
}

/**
 * Une case par jour : delta = dernière position du jour − dernière position
 * du jour précédent *ayant des lignes* (pas Σ des ± du jour).
 */
export function buildActivityDayCells(entries, now = new Date()) {
  const keys = buildActivityDayKeysNewestFirst(now);
  const lastBy = lastEntryByDay(entries);
  return keys.map((key) => {
    const last = lastBy.get(key);
    if (!last) {
      return { key, kind: "empty", delta: null };
    }
    const prev = previousDayWithData(key, lastBy);
    const delta = prev ? rowTumunTotal(last) - rowTumunTotal(prev) : null;
    return {
      key,
      kind: intensityKindFromDelta(delta, true),
      delta,
    };
  });
}
