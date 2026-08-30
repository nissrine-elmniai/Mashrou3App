import { colors } from "../../constants/theme";
import { JOUR_SEMAINE_VALUES } from "../../lib/seancesApi";

export const TOTAL_QURAN_PAGES = 604;

export const LEVEL_COLORS = {
  "مبتدئ": colors.gold,
  "متوسط": colors.blue,
  "متقدم": colors.primary,
};
export const STATUS_COLORS = {
  present: colors.green,
  absent: colors.red,
  none: colors.placeholder,
};

export const ARABIC_WEEKDAYS_SHORT = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

/**
 * Correspondance explicite Date.getDay() (0 = dimanche … 6 = samedi) → enum jour_semaine.
 * JOUR_SEMAINE_VALUES commence à السبت ; l'ordre JS getDay() commence à dimanche — ne pas
 * supposer que les deux listes partagent le même index.
 */
export const WEEKDAY_JS_INDEX_TO_JOUR_ENUM = {
  0: "الأحد",
  1: "الاثنين",
  2: "الثلاثاء",
  3: "الأربعاء",
  4: "الخميس",
  5: "الجمعة",
  6: "السبت",
};

/** Inverse : nom enum Postgres → index JS getDay(). */
export const JOUR_ENUM_TO_JS_WEEKDAY_INDEX = Object.fromEntries(
  Object.entries(WEEKDAY_JS_INDEX_TO_JOUR_ENUM).map(([jsIndex, jour]) => [
    jour,
    Number(jsIndex),
  ])
);

/** Valide qu'un libellé jour correspond à l'enum Postgres jour_semaine. */
export function isJourSemaineEnum(jourText) {
  return JOUR_SEMAINE_VALUES.includes(String(jourText || "").trim());
}

export const JUZ_STATUS_DEMO = Array.from({ length: 30 }, (_, i) => {
  if (i < 3) return "memorized";
  if (i < 5) return "inProgress";
  return "notStarted";
});

export const WEEKLY_PROGRESS_DEMO = [
  { week: "أسبوع 1", pages: 5 },
  { week: "أسبوع 2", pages: 8 },
  { week: "أسبوع 3", pages: 3 },
  { week: "أسبوع 4", pages: 10 },
];

export function todayIso() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "/");
}

const FRENCH_WEEKDAY_INDEX = {
  dimanche: 0,
  sunday: 0,
  lundi: 1,
  monday: 1,
  mardi: 2,
  tuesday: 2,
  mercredi: 3,
  wednesday: 3,
  jeudi: 4,
  thursday: 4,
  vendredi: 5,
  friday: 5,
  samedi: 6,
  saturday: 6,
};

/** Mappe seances.jour (arabe / français / anglais) vers index JS getDay() (0 = dimanche). */
export function parseSeanceWeekday(jourText) {
  const raw = String(jourText || "").trim();
  if (!raw) return null;

  for (let i = 0; i < ARABIC_WEEKDAYS_SHORT.length; i += 1) {
    const label = ARABIC_WEEKDAYS_SHORT[i];
    if (raw === label || raw.includes(label)) return i;
  }

  const normalized = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return FRENCH_WEEKDAY_INDEX[normalized] ?? null;
}

function formatDateSlash(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

/**
 * Date de la séance dans la semaine calendaire courante + indicateur si déjà passée.
 * @returns {{ sessionDate: string|null, hasOccurred: boolean }}
 */
export function getCurrentWeekSessionDate(jourText, refDate = new Date()) {
  const weekday = parseSeanceWeekday(jourText);
  if (weekday == null) {
    return { sessionDate: null, hasOccurred: false };
  }

  const ref = new Date(refDate);
  ref.setHours(0, 0, 0, 0);
  const session = new Date(ref);
  session.setDate(ref.getDate() + (weekday - ref.getDay()));

  const sessionDate = formatDateSlash(session);
  const todayStr = formatDateSlash(ref);
  return {
    sessionDate,
    hasOccurred: todayStr >= sessionDate,
  };
}

export function buildDateChips() {
  // Legacy : 5 jours calendaires glissants — plus utilisé par SupervisorAttendanceScreen
  // (remplacé par buildSessionDateChips). Conservé pour compatibilité / autres écrans futurs.
  const chips = [];
  const base = new Date();
  base.setDate(base.getDate() - 2);
  for (let i = 0; i < 5; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    chips.push({
      iso: d.toISOString().slice(0, 10).replace(/-/g, "/"),
      day: ARABIC_WEEKDAYS_SHORT[d.getDay()],
      num: d.getDate(),
    });
  }
  return chips;
}

function parseHeureDebutParts(heureDebut) {
  const raw = String(heureDebut || "").trim();
  if (!raw) return { hours: 0, minutes: 0 };
  const [h, m] = raw.slice(0, 5).split(":");
  return {
    hours: Number.parseInt(h, 10) || 0,
    minutes: Number.parseInt(m, 10) || 0,
  };
}

/** Session calendaire à partir d'une date slash YYYY/MM/DD. */
function sessionDateFromSlash(sessionDateSlash) {
  const [y, m, d] = sessionDateSlash.split("/").map((n) => Number.parseInt(n, 10));
  return new Date(y, m - 1, d);
}

function parseCalendarDateInput(value) {
  if (value instanceof Date) {
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  const str = String(value || "").slice(0, 10).replace(/\//g, "-");
  const [y, m, d] = str.split("-").map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function resolveJsWeekday(jourText) {
  const raw = String(jourText || "").trim();
  let jsWeekday = JOUR_ENUM_TO_JS_WEEKDAY_INDEX[raw] ?? null;
  if (jsWeekday == null) {
    jsWeekday = parseSeanceWeekday(jourText);
  }
  return jsWeekday;
}

/** Début effectif d'une occurrence (heure_debut le jour de séance). */
function getOccurrenceSessionStart(sessionDateSlash, heureDebut) {
  const sessionStart = sessionDateFromSlash(sessionDateSlash);
  const { hours, minutes } = parseHeureDebutParts(heureDebut);
  sessionStart.setHours(hours, minutes, 0, 0);
  return sessionStart;
}

/** Fin de fenêtre de marquage (heure_debut + 48h), ISO string. */
export function getOccurrenceWindowEnd(sessionDateSlash, heureDebut) {
  const sessionStart = getOccurrenceSessionStart(sessionDateSlash, heureDebut);
  const windowEnd = new Date(sessionStart.getTime() + 48 * 60 * 60 * 1000);
  return windowEnd.toISOString();
}

/** Fenêtre de marquage ouverte pour une occurrence donnée. */
export function isOccurrenceMarkingWindowOpen(
  sessionDateSlash,
  heureDebut,
  refDate = new Date()
) {
  const sessionStart = getOccurrenceSessionStart(sessionDateSlash, heureDebut);
  const windowEnd = new Date(sessionStart.getTime() + 48 * 60 * 60 * 1000);
  const ref = new Date(refDate);
  return ref >= sessionStart && ref <= windowEnd;
}

/** L'heure_debut de l'occurrence est passée (ou maintenant). */
export function isOccurrenceSessionStarted(sessionDateSlash, heureDebut, refDate = new Date()) {
  return new Date(refDate) >= getOccurrenceSessionStart(sessionDateSlash, heureDebut);
}

/**
 * Occurrences hebdomadaires du jour de séance entre startDate et refDate (inclus),
 * pas au-delà d'aujourd'hui. Tri : récent en premier.
 */
export function getSeanceOccurrencesBetween(jourText, startDate, endDate, refDate = new Date()) {
  const jsWeekday = resolveJsWeekday(jourText);
  if (jsWeekday == null) return [];

  const start = parseCalendarDateInput(startDate);
  if (!start) return [];

  const ref = new Date(refDate);
  ref.setHours(0, 0, 0, 0);
  const endParsed = parseCalendarDateInput(endDate || refDate);
  const cap = endParsed && endParsed < ref ? endParsed : ref;

  let session = new Date(start);
  session.setDate(start.getDate() + (jsWeekday - start.getDay()));
  if (session < start) {
    session.setDate(session.getDate() + 7);
  }

  const occurrences = [];
  while (session <= cap) {
    occurrences.push(formatDateSlash(session));
    const next = new Date(session);
    next.setDate(next.getDate() + 7);
    session = next;
  }

  return occurrences.sort((a, b) => b.localeCompare(a));
}

/**
 * Occurrence la plus récente du jour de séance dont heure_debut est passée (ou maintenant).
 * Fenêtre de marquage : [heure_debut, heure_debut + 48h].
 * @returns {{ sessionDate: string|null, withinMarkingWindow: boolean, sessionStarted: boolean, markingWindowEnd?: string|null }}
 */
export function getLatestSeanceOccurrence(jourText, refDate = new Date(), heureDebut = null) {
  const jsWeekday = resolveJsWeekday(jourText);
  if (jsWeekday == null) {
    return {
      sessionDate: null,
      withinMarkingWindow: false,
      sessionStarted: false,
      markingWindowEnd: null,
    };
  }

  const ref = new Date(refDate);
  const refMidnight = new Date(ref);
  refMidnight.setHours(0, 0, 0, 0);

  const thisWeekSession = new Date(refMidnight);
  thisWeekSession.setDate(refMidnight.getDate() + (jsWeekday - refMidnight.getDay()));

  const thisWeekStart = getOccurrenceSessionStart(
    formatDateSlash(thisWeekSession),
    heureDebut
  );

  let occurrenceCalendar = thisWeekSession;
  if (ref < thisWeekStart) {
    occurrenceCalendar = new Date(thisWeekSession);
    occurrenceCalendar.setDate(occurrenceCalendar.getDate() - 7);
  }

  const sessionDate = formatDateSlash(occurrenceCalendar);

  return {
    sessionDate,
    withinMarkingWindow: isOccurrenceMarkingWindowOpen(sessionDate, heureDebut, refDate),
    sessionStarted: isOccurrenceSessionStarted(sessionDate, heureDebut, refDate),
    markingWindowEnd: getOccurrenceWindowEnd(sessionDate, heureDebut),
  };
}

/**
 * Fenêtre de marquage : de heure_debut le jour de séance jusqu'à fin du J+2 (23:59:59).
 */
function isWithinSessionMarkingWindow(sessionDateSlash, heureDebut, refDate) {
  const sessionStart = sessionDateFromSlash(sessionDateSlash);
  const { hours, minutes } = parseHeureDebutParts(heureDebut);
  sessionStart.setHours(hours, minutes, 0, 0);

  const windowEnd = new Date(sessionStart);
  windowEnd.setDate(windowEnd.getDate() + 2);
  windowEnd.setHours(23, 59, 59, 999);

  const ref = new Date(refDate);
  return ref >= sessionStart && ref <= windowEnd;
}

/**
 * Chips de dates — obsolète (SupervisorAttendanceScreen n'utilise plus un sélecteur).
 * Conservé pour référence ; préférer getLatestSeanceOccurrence.
 */
export function buildSessionDateChips(jourText, refDate = new Date(), heureDebut = null) {
  const raw = String(jourText || "").trim();
  let jsWeekday = JOUR_ENUM_TO_JS_WEEKDAY_INDEX[raw] ?? null;
  if (jsWeekday == null) {
    jsWeekday = parseSeanceWeekday(jourText);
  }
  if (jsWeekday == null) return [];

  const ref = new Date(refDate);
  ref.setHours(0, 0, 0, 0);
  const chips = [];
  const seen = new Set();

  for (let weekOffset = 0; weekOffset <= 4; weekOffset += 1) {
    const session = new Date(ref);
    session.setDate(ref.getDate() + (jsWeekday - ref.getDay()) - weekOffset * 7);

    const iso = formatDateSlash(session);
    if (seen.has(iso)) continue;
    if (!isWithinSessionMarkingWindow(iso, heureDebut, refDate)) continue;

    seen.add(iso);
    chips.push({
      iso,
      day: ARABIC_WEEKDAYS_SHORT[session.getDay()],
      num: session.getDate(),
    });
  }

  return chips.sort((a, b) => a.iso.localeCompare(b.iso));
}

/** Date la plus récente parmi les chips de séance (défaut de sélection). */
export function getDefaultSessionChipIso(chips) {
  if (!chips?.length) return null;
  return chips[chips.length - 1].iso;
}

export function deriveLevel(pct) {
  if (pct < 34) return "مبتدئ";
  if (pct < 67) return "متوسط";
  return "متقدم";
}

export function initials(name = "") {
  return name.trim().charAt(0) || "؟";
}

/** Libellé arabe du nombre de membres (carte séance superviseur). */
export function formatMemberCount(count) {
  const n = Number(count) || 0;
  if (n === 0) return "لا يوجد اعضاء";
  if (n === 1) return "عضو واحد";
  if (n === 2) return "عضوين";
  return `${n} اعضاء`;
}

/** Libellé bannière : alertes admin non acquittées (RG9). */
export function formatNewAlertsBannerLabel(count) {
  const n = Number(count) || 0;
  if (n === 1) return "لديك تنبيه واحد جديد";
  if (n === 2) return "لديك تنبيهان جديدان";
  return `لديك ${n} تنبيهات جديدة`;
}
