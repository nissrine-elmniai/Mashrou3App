/** 1 حزب = 8 أثمان */
export const TUMUNS_PER_HIZB = 8;

export const TOTAL_JUZ = 30;

/** 1 جزء = 2 حزب */
export const TOTAL_HIZB = TOTAL_JUZ * 2;

export function totalTumunsFor(nbHizb) {
  return Math.max(0, Number(nbHizb) || 0) * TUMUNS_PER_HIZB;
}

export function clampTumuns(value, nbHizb) {
  const total = totalTumunsFor(nbHizb);
  return Math.min(total, Math.max(0, Math.round(Number(value) || 0)));
}

export function tumunsToPercent(tumuns, nbHizb) {
  const total = totalTumunsFor(nbHizb);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((clampTumuns(tumuns, nbHizb) / total) * 100));
}

export function percentToTumuns(pct, nbHizb) {
  const total = totalTumunsFor(nbHizb);
  if (total <= 0) return 0;
  const pctNum = Math.min(100, Math.max(0, Number(pct) || 0));
  return clampTumuns(Math.round((pctNum / 100) * total), nbHizb);
}

export function hizbBreakdown(tumuns, nbHizb) {
  const completed = Math.floor(clampTumuns(tumuns, nbHizb) / TUMUNS_PER_HIZB);
  const nb = Math.max(0, Number(nbHizb) || 0);
  return {
    completed,
    remaining: Math.max(0, nb - completed),
  };
}

/** Position thumun courante dans le hizb en cours (1..8), ou null si tout est complété. */
export function currentTumunInHizb(completedTumuns, nbHizb) {
  const clamped = clampTumuns(completedTumuns, nbHizb);
  const total = totalTumunsFor(nbHizb);
  if (clamped <= 0 || clamped >= total) return null;
  return (clamped % TUMUNS_PER_HIZB) || TUMUNS_PER_HIZB;
}

export function enrichMemberProgram(program) {
  const nbHizb = Number(program.nbHizb) || 0;
  const completedTumuns =
    program.completedTumuns != null
      ? clampTumuns(program.completedTumuns, nbHizb)
      : percentToTumuns(program.progression, nbHizb);
  const totalTumuns = totalTumunsFor(nbHizb);
  const progression = tumunsToPercent(completedTumuns, nbHizb);
  const { completed: hizbCompleted, remaining: hizbRemaining } = hizbBreakdown(
    completedTumuns,
    nbHizb
  );

  return {
    ...program,
    nbHizb,
    completedTumuns,
    totalTumuns,
    progression,
    hizbCompleted,
    hizbRemaining,
  };
}
