import { colors } from "./theme";

/** Statut SQL du test, plus « جارٍ » qui n'existe qu'à l'affichage. */
export const TEST_STATUS = {
  planifie: { label: "قادم", color: colors.blue },
  en_cours: { label: "جارٍ", color: colors.gold },
  termine: { label: "منجز", color: colors.primary },
  annule: { label: "ملغى", color: colors.red },
};

/** Statut d'invitation (enum invite / confirme / refuse / note). */
export const INVITATION_STATUS = {
  invite: { label: "مدعو", color: colors.muted },
  confirme: { label: "مؤكد", color: colors.blue },
  refuse: { label: "معتذر", color: colors.red },
  note: { label: "منقط", color: colors.primary },
};

/** Invitation déjà notée et dont le résultat a été envoyé au membre. */
export const RESULT_SENT_LABEL = {
  label: "تم الإرسال",
  color: colors.gold,
};

export const TEST_TYPE_LABELS = {
  hifz: "اختبار الحفظ",
  sunnah: "حفاظ السنة",
};

/**
 * Date calendaire (annonce ou date choisie) en arabe.
 * On construit la date en heure locale pour ne pas décaler le jour (UTC).
 * Chaîne vide si la valeur est absente ou illisible.
 */
/**
 * Jour civil à Casablanca (YYYY-MM-DD). Même règle que le garde-fou SQL :
 * une date est future seulement si elle est strictement après ce jour.
 */
export function casablancaTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

/**
 * Statut affiché d'un test. tests.statut reste la source métier
 * (planifie / termine / annule). « جارٍ » est dérivé des dates et des notes.
 * Sans opts.dates / opts.invitations, on lit test.test_dates et test.invitations.
 */
export function getTestDisplayStatus(test, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const dateRows = Array.isArray(options.dates)
    ? options.dates
    : Array.isArray(test?.test_dates)
      ? test.test_dates
      : [];
  const inviteRows = Array.isArray(options.invitations)
    ? options.invitations
    : Array.isArray(test?.invitations)
      ? test.invitations
      : [];
  const isos = [];
  dateRows.forEach((row) => {
    const iso = String(row?.date_proposee || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) isos.push(iso);
  });
  isos.sort();
  const firstDate = isos[0] || "";
  const lastDate = isos[isos.length - 1] || "";
  const today = casablancaTodayIso();
  const allDatesPassed = Boolean(lastDate && today && today > lastDate);

  if (test?.statut === "annule") {
    return { ...TEST_STATUS.annule, key: "annule", allDatesPassed };
  }
  if (test?.statut === "termine") {
    return { ...TEST_STATUS.termine, key: "termine", allDatesPassed };
  }

  const hasNote = inviteRows.some((row) => row?.statut === "note");
  const started = Boolean((firstDate && today && today >= firstDate) || hasNote);
  if (started) {
    return { ...TEST_STATUS.en_cours, key: "en_cours", allDatesPassed };
  }
  return { ...TEST_STATUS.planifie, key: "planifie", allDatesPassed };
}

/** Décale un YYYY-MM-DD d'un nombre de jours calendaires, sans heure. */
export function addCalendarDays(iso, days) {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Date locale (minuit appareil) pour le DateTimePicker, à partir d'un YYYY-MM-DD. */
export function isoToLocalDate(iso) {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

/** YYYY-MM-DD du jour calendaire choisi dans le DateTimePicker. */
export function localDateToIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Jour et mois courts, pour une chip. Vide si la valeur n'est pas une date. */
export function formatShortTestDate(value) {
  const iso = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ar-MA", { day: "numeric", month: "short" });
}

/**
 * Heure Postgres (« HH:mm:ss » ou « HH:mm ») en « HH:mm », chiffres latins, 24 h.
 * Chaîne vide si l'heure est absente ou illisible.
 */
export function formatTestTime(value) {
  if (value == null || String(value).trim() === "") return "";
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** « HH:mm » de l'heure choisie dans le DateTimePicker. Minutes toujours sur deux chiffres. */
export function localTimeToHm(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return formatTestTime(`${hours}:${minutes}`);
}

export function formatTestDate(value) {
  const iso = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ar-MA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
