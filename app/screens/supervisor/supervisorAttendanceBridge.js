let onAttendanceSavedHandler = null;

export function registerSupervisorAttendanceSaved(handler) {
  onAttendanceSavedHandler = handler;
}

export function unregisterSupervisorAttendanceSaved() {
  onAttendanceSavedHandler = null;
}

export function emitSupervisorAttendanceSaved() {
  onAttendanceSavedHandler?.();
}
