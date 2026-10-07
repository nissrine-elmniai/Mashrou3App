import { DeviceEventEmitter } from "react-native";

/** Le tap push « alerte_nouvelle » demande au gate de recharger sa file. */
export const ALERT_GATE_REFRESH = "alertGate:refresh";

export function emitAlertGateRefresh() {
  DeviceEventEmitter.emit(ALERT_GATE_REFRESH);
}

/** @returns {() => void} désabonnement */
export function subscribeAlertGateRefresh(listener) {
  if (typeof listener !== "function") return () => {};
  const sub = DeviceEventEmitter.addListener(ALERT_GATE_REFRESH, listener);
  return () => sub.remove();
}
