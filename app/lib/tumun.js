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

/**
 * tumun_courant = nombre de أثمان mémorisés du حزب en cours, 0 à 7.
 * Même valeur à l'écran et en base. 7 + 1 ثمن → حزب suivant, ثمن 0.
 */
export function positionFromMemberTumuns(tumuns) {
  const clamped = clampMemberTumuns(tumuns);
  return {
    nbHizbCompletes: Math.floor(clamped / TUMUNS_PER_HIZB),
    tumunCourant: clamped % TUMUNS_PER_HIZB,
  };
}

export const TUMUN_COURANT_MAX = TUMUNS_PER_HIZB - 1;

export const TUMUN_COURANT_LABEL = "أثمان إضافية (0–7)";

export const TUMUN_COURANT_ERROR = "عدد الأثمان يجب أن يكون بين 0 و 7";

/** Saisie du ثمن : entier 0–7, stocké tel quel. Vide → erreur (pas de défaut). */
export function parseTumunCourantInput(raw) {
  const trimmed = String(raw ?? "").trim();
  const n = trimmed === "" ? Number.NaN : Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > TUMUN_COURANT_MAX) {
    return { ok: false, error: TUMUN_COURANT_ERROR };
  }
  return { ok: true, value: n };
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

/**
 * Compte d'أحزاب, même accord que pour ثمن :
 * 0 → « 0 حزب » ؛ 1 → « حزب واحد » ؛ 2 → « حزبان » (sans chiffre) ؛
 * 3–10 → « n أحزاب » ؛ 11+ → « n حزبًا » (تمييز منصوب).
 * Les décimales restent au singulier (حزب).
 */
export function formatHizbCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) {
    return `${wrapLtr(0)} حزب`;
  }
  if (!Number.isInteger(n)) {
    const one = Math.round(n * 10) / 10;
    const label = one === Math.floor(one) ? String(one) : one.toFixed(1);
    return `${wrapLtr(label)} حزب`;
  }
  if (n === 1) return HIZB_FORMS.one;
  if (n === 2) return HIZB_FORMS.dual;
  if (n >= 3 && n <= 10) return `${wrapLtr(n)} أحزاب`;
  if (n >= 11) return `${wrapLtr(n)} حزبًا`;
  return `${wrapLtr(n)} حزب`;
}

function formatUnitChunk(phrase, sign) {
  if (phrase.leadingNum != null) {
    const head = sign != null ? `${sign}${phrase.leadingNum}` : String(phrase.leadingNum);
    return `${wrapLtr(head)} ${phrase.text}`;
  }
  if (sign != null) return `${wrapLtr(sign)} ${phrase.text}`;
  return phrase.text;
}

/**
 * Quantité de programme « 5 أحزاب و 3 أثمان » depuis un total de أثمان.
 * 40 → « 5 أحزاب », 43 → « 5 أحزاب و 3 أثمان », 3 → « 3 أثمان », 0 → « 0 ثمن ».
 * Sans plafond à 480 (affichage seulement, aucune valeur stockée ne change).
 */
export function formatTumunAmount(tumuns) {
  const total = Math.max(0, Math.round(Number(tumuns) || 0));
  const hizb = Math.floor(total / TUMUNS_PER_HIZB);
  const tumun = total % TUMUNS_PER_HIZB;
  if (hizb === 0 && tumun === 0) return `${wrapLtr(0)} ثمن`;
  if (tumun === 0) return formatHizbCount(hizb);
  const tumunText = formatUnitChunk(arabicUnitPhrase(tumun, TUMUN_FORMS), null);
  if (hizb === 0) return tumunText;
  return `${formatHizbCount(hizb)} و ${tumunText}`;
}

/**
 * Écart signé « +3 أثمان », « −حزب واحد » : signe collé à la quantité
 * (isolat LTR), quantité au format formatTumunAmount.
 * @returns {string|null} null si l'écart est nul.
 */
export function formatSignedTumunAmount(deltaTumuns) {
  const n = Math.round(Number(deltaTumuns) || 0);
  if (n === 0) return null;
  const sign = n > 0 ? "+" : "−";
  return `${wrapLtr(sign)}${formatTumunAmount(Math.abs(n))}`;
}

/**
 * Écart non enregistré : « تعديلات غير محفوظة: +3 أثمان ».
 * @returns {string|null} null si l'écart est nul.
 */
export function formatUnsavedTumunDelta(deltaTumuns) {
  const signed = formatSignedTumunAmount(deltaTumuns);
  return signed ? `تعديلات غير محفوظة: ${signed}` : null;
}

/**
 * Position « 5 أحزاب و 3 أثمان » depuis un total de أثمان (0–480).
 * Le ثمن est omis quand il vaut 0.
 */
export function formatMemberPosition(tumuns) {
  const { nbHizbCompletes, tumunCourant } = positionFromMemberTumuns(tumuns);
  const hizb = formatHizbCount(nbHizbCompletes);
  if (tumunCourant === 0) return hizb;
  return `${hizb} و ${formatUnitChunk(arabicUnitPhrase(tumunCourant, TUMUN_FORMS), null)}`;
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
