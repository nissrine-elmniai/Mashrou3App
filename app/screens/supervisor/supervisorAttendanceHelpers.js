export const SUPABASE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSupabaseEntityId(id) {
  return typeof id === "string" && SUPABASE_UUID_RE.test(id);
}

export function formatSessionDateLabel(sessionDate) {
  if (!sessionDate) return "";
  return String(sessionDate).replace(/-/g, "/");
}

export function formatDeadlineLabel(markingWindowEnd) {
  if (!markingWindowEnd) return "";
  const d = new Date(markingWindowEnd);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

export function recordsFromByMemberId(memberIds, byMemberId = {}) {
  const init = {};
  memberIds.forEach((id) => {
    const status = byMemberId[id];
    init[id] = status === "present";
  });
  return init;
}

export function markingAlertText(sessionDate, isMarked, markingWindowEnd) {
  const dateLabel = formatSessionDateLabel(sessionDate);
  const deadline = formatDeadlineLabel(markingWindowEnd);
  if (isMarked) {
    return deadline
      ? `الحضور مسجّل لهذه الحصة  \nيمكنك التعديل حتى ${deadline}`
      : `الحضور مسجّل لهذه الحصة  \n يمكنك التعديل خلال 48 ساعة`;
  }
  return `تسجيل الحضور — هذه الحصة`;
}

/** Invite à marquer avant la fin de la fenêtre (carte historique non marquée). */
export function unmarkedDeadlinePrompt(markingWindowEnd) {
  const deadline = formatDeadlineLabel(markingWindowEnd);
  if (deadline) {
    return `يرجى تسجيل الحضور قبل ${deadline}`;
  }
  return "يرجى تسجيل الحضور خلال 48 ساعة";
}

function sessionDateToMonthKey(sessionDate) {
  const parts = String(sessionDate || "").split(/[/-]/);
  if (parts.length < 2) return "";
  return `${parts[0]}-${parts[1]}`;
}

export function formatMonthGroupLabel(monthKey) {
  if (!monthKey) return "";
  const [y, m] = monthKey.split("-");
  const year = Number(y);
  const month = Number(m);
  if (!year || !month) return monthKey;
  const d = new Date(year, month - 1, 1);
  if (Number.isNaN(d.getTime())) return monthKey;
  return d.toLocaleDateString("ar-MA", { year: "numeric", month: "long" });
}

/** Regroupe les lignes d'historique par mois (ordre conservé : plus récent en premier). */
export function groupAttendanceRowsByMonth(rows = [], dateKey = "sessionDate") {
  const groups = [];
  const indexByKey = new Map();

  rows.forEach((row) => {
    const monthKey = sessionDateToMonthKey(row[dateKey]);
    if (!monthKey) return;

    if (!indexByKey.has(monthKey)) {
      const group = {
        monthKey,
        label: formatMonthGroupLabel(monthKey),
        rows: [],
      };
      indexByKey.set(monthKey, groups.length);
      groups.push(group);
    }
    groups[indexByKey.get(monthKey)].rows.push(row);
  });

  return groups;
}

/** Regroupe les records membre ({ date, status }) par mois pour MemberProfileScreen. */
export function groupMemberPresenceByMonth(records = []) {
  return groupAttendanceRowsByMonth(records, "date");
}

/** Résumé compact pour l’écran historique : nb séances + % présence saison. */
export function computeAttendanceHistorySummary(rows = [], memberTotal = 0) {
  const sessionCount = rows.length;
  if (!sessionCount || !memberTotal) {
    return { sessionCount, attendancePct: null };
  }

  let presentSum = 0;
  let slotSum = 0;
  rows.forEach((row) => {
    if (!row.isMarked) return;
    presentSum += row.presentCount;
    slotSum += memberTotal;
  });

  const attendancePct =
    slotSum > 0 ? Math.round((presentSum / slotSum) * 100) : null;

  return { sessionCount, attendancePct };
}
