import AsyncStorage from "@react-native-async-storage/async-storage";

/** Bump version when seed/schema changes so old demo caches are dropped */
const STORAGE_KEY = "@mashrou3/app_state_v2";

export async function loadAppState() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveAppState(state) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export async function clearAppState() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
