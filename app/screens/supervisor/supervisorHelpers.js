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
