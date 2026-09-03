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

/** Borne un total de ثمن à l'échelle du Coran (0–480). */
export function clampMemberTumuns(value) {
  const max = TOTAL_HIZB * TUMUNS_PER_HIZB;
  return Math.min(max, Math.max(0, Math.round(Number(value) || 0)));
}

export function memberTumunsFromPosition(nbHizbCompletes, tumunCourant) {
  const hizb = Math.max(0, Number(nbHizbCompletes) || 0);
  const tumun = Math.max(0, Number(tumunCourant) || 0);
  return clampMemberTumuns(hizb * TUMUNS_PER_HIZB + tumun);
}

/** tumunCourant stocké : reste 0–7. L'UI saisie est 1–8 (8 = reste 0). */
export function positionFromMemberTumuns(tumuns) {
  const clamped = clampMemberTumuns(tumuns);
  return {
    nbHizbCompletes: Math.floor(clamped / TUMUNS_PER_HIZB),
    tumunCourant: clamped % TUMUNS_PER_HIZB,
  };
}

/** Saisie : الثمن من 1 إلى 8. 8 = حزب مكتمل (reste stocké 0). */
export const TUMUN_UI_MIN = 1;
export const TUMUN_UI_MAX = TUMUNS_PER_HIZB;

export function tumunUiToStored(tumunUi) {
  const t = Number(tumunUi);
  if (!Number.isInteger(t) || t === TUMUN_UI_MAX) return 0;
  return Math.min(TUMUN_UI_MAX - 1, Math.max(0, t));
}

export function tumunStoredToUi(tumunStored) {
  const t = Number(tumunStored);
  if (!Number.isInteger(t) || t <= 0) return TUMUN_UI_MAX;
  return Math.min(TUMUN_UI_MAX, t);
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

/** Isolat LTR : le signe reste collé au chiffre latin dans un texte RTL. */
const LRI = "\u2066";
const PDI = "\u2069";

function wrapLtr(value) {
  return `${LRI}${value}${PDI}`;
}

/**
 * Pluriel arabe : 1 / 2 / 3–10 / 11+.
 * 11+ : nom au singulier (حزبا، ثمنا) — pas أحزاب.
 * @param {number} count
 * @param {{ one: string, dual: string, plural: string, counted: string }} forms
 * @returns {{ text: string, leadingNum: number|null }}
 */
export function arabicUnitPhrase(count, forms) {
  const n = Math.abs(Number(count) || 0);
  if (n === 1) return { text: forms.one, leadingNum: null };
  if (n === 2) return { text: forms.dual, leadingNum: null };
  if (n >= 11) return { text: forms.counted, leadingNum: n };
  return { text: forms.plural, leadingNum: n };
}

const HIZB_FORMS = {
  one: "حزب واحد",
  dual: "حزبان",
  plural: "أحزاب",
  counted: "حزبا",
};
const TUMUN_FORMS = {
  one: "ثمن واحد",
  dual: "ثمنان",
  plural: "أثمان",
  counted: "ثمنا",
};

function formatUnitChunk(phrase, sign) {
  if (phrase.leadingNum != null) {
    const head = sign != null ? `${sign}${phrase.leadingNum}` : String(phrase.leadingNum);
    return `${wrapLtr(head)} ${phrase.text}`;
  }
  if (sign != null) return `${wrapLtr(sign)} ${phrase.text}`;
  return phrase.text;
}

/**
 * Libellé de rythme depuis un delta en أثمان (même règle pour saison et semaine).
 * Masqué si null ou 0. suffixe : « هذا الموسم » / « هذا الأسبوع ».
 * @param {number|null|undefined} deltaTumuns
 * @param {string} [suffix]
 * @returns {string|null}
 */
export function formatHizbTumunDelta(deltaTumuns, suffix) {
  const n = Number(deltaTumuns);
  if (!Number.isFinite(n) || n === 0) return null;
  const sign = n > 0 ? "+" : "−";
  const abs = Math.abs(n);
  const hizb = Math.floor(abs / TUMUNS_PER_HIZB);
  const tumun = abs % TUMUNS_PER_HIZB;

  const chunks = [];
  if (hizb > 0) chunks.push(arabicUnitPhrase(hizb, HIZB_FORMS));
  if (tumun > 0) chunks.push(arabicUnitPhrase(tumun, TUMUN_FORMS));
  if (chunks.length === 0) return null;

  let body = formatUnitChunk(chunks[0], sign);
  for (let i = 1; i < chunks.length; i += 1) {
    body += ` و ${formatUnitChunk(chunks[i], null)}`;
  }
  const extra = suffix ? String(suffix).trim() : "";
  return extra ? `${body} ${extra}` : body;
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
