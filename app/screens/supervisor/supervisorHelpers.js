import { colors } from "../../constants/theme";

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
