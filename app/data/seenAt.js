import AsyncStorage from "@react-native-async-storage/async-storage";

function seenAtStorageKey(scope, userId, seanceId) {
  return `@mashrou3/seen_at:${scope}:${userId}:${seanceId}`;
}

function legacyMembersSeenKey(userId, seanceId) {
  return `@mashrou3/members_seen_at:${userId}:${seanceId}`;
}

/** ISO string stockée, ou null si absente / invalide / erreur. */
export async function getSeenAt(scope, userId, seanceId) {
  try {
    if (!scope || !userId || !seanceId) return null;
    const key = seenAtStorageKey(scope, userId, seanceId);
    const raw = await AsyncStorage.getItem(key);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) return value;

    if (scope === "members") {
      const legacyRaw = await AsyncStorage.getItem(
        legacyMembersSeenKey(userId, seanceId)
      );
      const legacyValue = typeof legacyRaw === "string" ? legacyRaw.trim() : "";
      if (legacyValue) {
        await AsyncStorage.setItem(key, legacyValue);
        return legacyValue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Écrit l’ISO ; no-op silencieux si args manquants ou erreur storage. */
export async function setSeenAt(scope, userId, seanceId, isoString) {
  try {
    if (!scope || !userId || !seanceId || !isoString) return;
    await AsyncStorage.setItem(
      seenAtStorageKey(scope, userId, seanceId),
      String(isoString)
    );
  } catch {
    // no-op
  }
}

/** Libellé badge compteur : "+1"…"+99". Vide si count <= 0. */
export function formatCountBadge(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  if (n > 99) return "+99";
  return `+${n}`;
}
