import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import {
  getLatestSeanceOccurrence,
  getSeanceOccurrencesBetween,
  isOccurrenceMarkingWindowOpen,
  getOccurrenceWindowEnd,
} from "../screens/supervisor/supervisorHelpers";

const SUPABASE_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} — انتهت المهلة (${Math.round(ms / 1000)}ث)`)),
        ms
      );
    }),
  ]);
}

function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/column.*does not exist/i.test(msg)) {
    return `عمود مفقود في ${tableLabel}`;
  }
  return mapSupabaseAuthError(error);
}

function isTableMissingError(error) {
  const msg = error?.message || "";
  return /relation.*does not exist|Could not find the table/i.test(msg);
}

/** Normalise statut depuis la colonne presences.statut ('present' | 'absent'). */
function normalizePresenceStatus(row) {
  if (row == null) return "unset";
  const raw = String(row.statut ?? "").toLowerCase();
  if (raw === "present") return "present";
  if (raw === "absent") return "absent";
  return "unset";
}

function extractPresenceDate(row) {
  if (row?.date) {
    return String(row.date).slice(0, 10).replace(/-/g, "/");
  }
  if (row?.created_at) {
    return String(row.created_at).slice(0, 10).replace(/-/g, "/");
  }
  return null;
}

/**
 * Historique de présence d'un membre (table presences si elle existe en base).
 * Taux = présent / total des séances marquées (present ou absent).
 * records contient tout l'historique marqué (tri décroissant) — la pagination
 * par mois est gérée côté UI (MemberProfileScreen).
 * @returns {{ ok, hasData?, records?, rate?, presentCount?, absentCount?, tableMissing?, error? }}
 */
export async function getMemberPresenceSummary(membreId, seanceId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!membreId) {
    return { ok: false, error: "معرّف العضو مفقود" };
  }

  try {
    let query = supabase
      .from("presences")
      .select("membre_id, seance_id, date, statut, created_at")
      .eq("membre_id", membreId);
    if (seanceId) {
      query = query.eq("seance_id", seanceId);
    }

    let data;
    let error;
    const ordered = await withTimeout(
      query.order("date", { ascending: false }),
      SUPABASE_TIMEOUT_MS,
      "قراءة حضور العضو"
    );
    data = ordered.data;
    error = ordered.error;

    if (error && /column.*does not exist/i.test(error?.message || "")) {
      let fbQuery = supabase
        .from("presences")
        .select("membre_id, seance_id, date, statut, created_at")
        .eq("membre_id", membreId);
      if (seanceId) {
        fbQuery = fbQuery.eq("seance_id", seanceId);
      }
      const fallback = await withTimeout(
        fbQuery.order("created_at", { ascending: false }),
        SUPABASE_TIMEOUT_MS,
        "قراءة حضور العضو"
      );
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      if (isTableMissingError(error)) {
        return {
          ok: true,
          hasData: false,
          records: [],
          rate: null,
          presentCount: 0,
          absentCount: 0,
          tableMissing: true,
        };
      }
      return { ok: false, error: mapTableError(error, "presences") };
    }

    const records = (data || [])
      .map((row) => ({
        date: extractPresenceDate(row),
        status: normalizePresenceStatus(row),
      }))
      .filter((r) => r.status === "present" || r.status === "absent");

    const marked = records;
    const presentCount = marked.filter((r) => r.status === "present").length;
    const absentCount = marked.filter((r) => r.status === "absent").length;
    const rate =
      marked.length > 0 ? Math.round((presentCount / marked.length) * 100) : null;

    return {
      ok: true,
      hasData: marked.length > 0,
      records: marked,
      rate,
      presentCount,
      absentCount,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Présence batch pour une séance à une date de séance précise (modèle hebdomadaire).
 * @returns {{ ok, byMemberId?: Record<string, 'present'|'absent'|'unset'>, degraded?, error? }}
 */
export async function getSeancePresenceForDate(seanceId, sessionDateIso, memberIds = []) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", byMemberId: {} };
  }
  if (!seanceId || !sessionDateIso) {
    return { ok: true, byMemberId: {} };
  }

  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true, byMemberId: {} };
  }

  const dbDate = String(sessionDateIso).slice(0, 10).replace(/\//g, "-");

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("presences")
        .select("membre_id, statut")
        .eq("seance_id", seanceId)
        .eq("date", dbDate)
        .in("membre_id", ids),
      SUPABASE_TIMEOUT_MS,
      "قراءة حضور الحصة"
    );

    if (error) {
      console.warn("[presenceApi] getSeancePresenceForDate", error);
      const msg = error?.message || "";
      if (
        isTableMissingError(error) ||
        /permission|row-level security|RLS|42501|violates row/i.test(msg)
      ) {
        return { ok: true, byMemberId: {}, degraded: true };
      }
      return { ok: false, error: mapTableError(error, "presences"), byMemberId: {} };
    }

    const byMemberId = {};
    for (const id of ids) {
      byMemberId[id] = "unset";
    }
    for (const row of data || []) {
      const status = normalizePresenceStatus(row);
      if (status === "present" || status === "absent") {
        byMemberId[row.membre_id] = status;
      }
    }

    return { ok: true, byMemberId };
  } catch (e) {
    console.warn("[presenceApi] getSeancePresenceForDate", e);
    return { ok: true, byMemberId: {}, degraded: true };
  }
}

function dbDateToSlash(dbDate) {
  return String(dbDate).slice(0, 10).replace(/-/g, "/");
}

function slashDateToDb(sessionDateIso) {
  return String(sessionDateIso).slice(0, 10).replace(/\//g, "-");
}

/**
 * Présences brutes pour une séance sur une plage de dates (inclus).
 * @returns {{ ok, byDate?: Record<string, Record<string, 'present'|'absent'>>, error? }}
 */
export async function getSeancePresenceForDateRange(
  seanceId,
  memberIds = [],
  fromDate,
  toDate
) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", byDate: {} };
  }
  if (!seanceId || !fromDate || !toDate) {
    return { ok: true, byDate: {} };
  }

  const ids = [...new Set((memberIds || []).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true, byDate: {} };
  }

  const fromDb = slashDateToDb(fromDate);
  const toDb = slashDateToDb(toDate);

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("presences")
        .select("membre_id, date, statut")
        .eq("seance_id", seanceId)
        .gte("date", fromDb)
        .lte("date", toDb)
        .in("membre_id", ids),
      SUPABASE_TIMEOUT_MS,
      "قراءة حضور الحصة"
    );

    if (error) {
      console.warn("[presenceApi] getSeancePresenceForDateRange", error);
      const msg = error?.message || "";
      if (
        isTableMissingError(error) ||
        /permission|row-level security|RLS|42501|violates row/i.test(msg)
      ) {
        return { ok: true, byDate: {}, degraded: true };
      }
      return { ok: false, error: mapTableError(error, "presences"), byDate: {} };
    }

    const byDate = {};
    for (const row of data || []) {
      const status = normalizePresenceStatus(row);
      if (status !== "present" && status !== "absent") continue;
      const dateSlash = dbDateToSlash(row.date);
      if (!byDate[dateSlash]) byDate[dateSlash] = {};
      byDate[dateSlash][row.membre_id] = status;
    }

    return { ok: true, byDate };
  } catch (e) {
    console.warn("[presenceApi] getSeancePresenceForDateRange", e);
    return { ok: true, byDate: {}, degraded: true };
  }
}

function countPresenceStats(byMemberId = {}, memberIds = []) {
  let presentCount = 0;
  let absentCount = 0;
  for (const id of memberIds) {
    const status = byMemberId[id];
    if (status === "present") presentCount += 1;
    else if (status === "absent") absentCount += 1;
  }
  const markedTotal = presentCount + absentCount;
  const pct =
    memberIds.length > 0
      ? Math.round((presentCount / memberIds.length) * 100)
      : 0;
  return { presentCount, absentCount, pct, markedTotal };
}

/**
 * Dates distinctes avec au moins une présence/absence enregistrée pour la séance.
 * @returns {{ ok, dates?: string[], degraded?, error? }} dates en YYYY/MM/DD
 */
async function getDistinctPresenceDatesForSeance(seanceId) {
  if (!seanceId) {
    return { ok: true, dates: [] };
  }

  try {
    const { data, error } = await withTimeout(
      supabase.from("presences").select("date, statut").eq("seance_id", seanceId),
      SUPABASE_TIMEOUT_MS,
      "قراءة تواريخ الحضور"
    );

    if (error) {
      console.warn("[presenceApi] getDistinctPresenceDatesForSeance", error);
      const msg = error?.message || "";
      if (
        isTableMissingError(error) ||
        /permission|row-level security|RLS|42501|violates row/i.test(msg)
      ) {
        return { ok: true, dates: [], degraded: true };
      }
      return { ok: false, error: mapTableError(error, "presences"), dates: [] };
    }

    const dates = new Set();
    for (const row of data || []) {
      const status = normalizePresenceStatus(row);
      if (status !== "present" && status !== "absent") continue;
      if (!row?.date) continue;
      dates.add(dbDateToSlash(row.date));
    }

    return { ok: true, dates: [...dates] };
  } catch (e) {
    console.warn("[presenceApi] getDistinctPresenceDatesForSeance", e);
    return { ok: true, dates: [], degraded: true };
  }
}

function mergeSessionDates(theoreticalDates = [], recordedDates = []) {
  const merged = new Set(theoreticalDates);
  recordedDates.forEach((d) => {
    if (d) merged.add(d);
  });
  return [...merged].sort((a, b) => b.localeCompare(a));
}

function timestampToSlashDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function maxSlashDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a >= b ? a : b;
}

function minSlashDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a <= b ? a : b;
}

function isSessionDateInPeriod(sessionDate, period, refDate = new Date()) {
  const fromDay = timestampToSlashDate(period.valideDepuis);
  const toDay = period.valideJusquA
    ? timestampToSlashDate(period.valideJusquA)
    : timestampToSlashDate(refDate);
  if (fromDay && sessionDate < fromDay) return false;
  if (toDay && sessionDate > toDay) return false;
  return true;
}

/**
 * Périodes de planning pour une séance : historique archivé + période courante (seances).
 * @returns {{ ok, periods?: Array, error?, degraded? }}
 */
export async function getSeancePlanningPeriods(seanceId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", periods: [] };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود", periods: [] };
  }

  try {
    const [seanceRes, historyRes] = await Promise.all([
      withTimeout(
        supabase
          .from("seances")
          .select("jour, heure_debut, heure_fin, planning_valide_depuis")
          .eq("id", seanceId)
          .maybeSingle(),
        SUPABASE_TIMEOUT_MS,
        "قراءة الحصة"
      ),
      withTimeout(
        supabase
          .from("seance_planning_history")
          .select("jour, heure_debut, heure_fin, valide_depuis, valide_jusqu_a")
          .eq("seance_id", seanceId)
          .order("valide_depuis", { ascending: true }),
        SUPABASE_TIMEOUT_MS,
        "قراءة سجل الجدول"
      ),
    ]);

    const seanceError = seanceRes.error;
    const historyError = historyRes.error;

    if (seanceError) {
      return { ok: false, error: mapTableError(seanceError, "seances"), periods: [] };
    }

    let degraded = false;
    let historyRows = [];
    if (historyError) {
      const msg = historyError?.message || "";
      if (
        isTableMissingError(historyError) ||
        /permission|row-level security|RLS|42501|violates row/i.test(msg)
      ) {
        degraded = true;
      } else {
        return {
          ok: false,
          error: mapTableError(historyError, "seance_planning_history"),
          periods: [],
        };
      }
    } else {
      historyRows = historyRes.data || [];
    }

    const periods = (historyRows || []).map((row) => ({
      jour: row.jour,
      heureDebut: row.heure_debut ?? null,
      heureFin: row.heure_fin ?? null,
      valideDepuis: row.valide_depuis,
      valideJusquA: row.valide_jusqu_a,
      isCurrent: false,
    }));

    if (seanceRes.data) {
      periods.push({
        jour: seanceRes.data.jour,
        heureDebut: seanceRes.data.heure_debut ?? null,
        heureFin: seanceRes.data.heure_fin ?? null,
        valideDepuis: seanceRes.data.planning_valide_depuis,
        valideJusquA: null,
        isCurrent: true,
      });
    }

    return { ok: true, periods, degraded };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", periods: [] };
  }
}

/**
 * Occurrences théoriques multi-périodes : chaque période utilise son propre jour/heure_debut.
 * @returns {{ sessionDates: string[], metaByDate: Map<string, { jour, heureDebut }> }}
 */
export function buildTheoreticalOccurrencesFromPeriods(
  periods = [],
  saisonDateDebut,
  refDate = new Date()
) {
  const metaByDate = new Map();
  const allDates = new Set();
  const refSlash = timestampToSlashDate(refDate);

  periods.forEach((period) => {
    if (!period?.jour) return;

    const periodFrom = timestampToSlashDate(period.valideDepuis);
    const periodTo = period.valideJusquA
      ? timestampToSlashDate(period.valideJusquA)
      : refSlash;

    const startBound = maxSlashDate(
      String(saisonDateDebut || "").slice(0, 10).replace(/-/g, "/"),
      periodFrom
    );
    const endBound = minSlashDate(refSlash, periodTo);

    if (!startBound || !endBound || startBound > endBound) return;

    const occurrences = getSeanceOccurrencesBetween(
      period.jour,
      startBound,
      endBound,
      refDate
    );

    occurrences.forEach((sessionDate) => {
      if (!isSessionDateInPeriod(sessionDate, period, refDate)) return;
      allDates.add(sessionDate);
      metaByDate.set(sessionDate, {
        jour: period.jour,
        heureDebut: period.heureDebut ?? null,
      });
    });
  });

  return {
    sessionDates: [...allDates].sort((a, b) => b.localeCompare(a)),
    metaByDate,
  };
}

async function buildTheoreticalOccurrencesForSeance(
  seanceId,
  fallbackJour,
  fallbackHeureDebut,
  saisonDateDebut,
  refDate
) {
  const periodsRes = await getSeancePlanningPeriods(seanceId);

  if (periodsRes.ok && periodsRes.periods?.length > 0) {
    const { sessionDates, metaByDate } = buildTheoreticalOccurrencesFromPeriods(
      periodsRes.periods,
      saisonDateDebut,
      refDate
    );
    return {
      ok: true,
      sessionDates,
      metaByDate,
      degraded: periodsRes.degraded,
    };
  }

  if (!fallbackJour) {
    return { ok: false, error: periodsRes.error || "تعذر تحميل فترات الجدول", sessionDates: [], metaByDate: new Map() };
  }

  const sessionDates = getSeanceOccurrencesBetween(
    fallbackJour,
    saisonDateDebut,
    refDate,
    refDate
  );
  const metaByDate = new Map(
    sessionDates.map((d) => [d, { jour: fallbackJour, heureDebut: fallbackHeureDebut ?? null }])
  );
  return { ok: true, sessionDates, metaByDate, degraded: periodsRes.degraded };
}

/**
 * Historique agrégé par occurrence de séance (depuis date_debut saison).
 * getLatestSeanceOccurrenceStatus reste inchangé pour les pastilles / occurrence courante.
 */
export async function buildSeanceAttendanceHistory(
  seanceId,
  jour,
  heureDebut,
  saisonDateDebut,
  memberIds = [],
  refDate = new Date()
) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId || !jour) {
    return { ok: false, error: "معرّف الحصة أو اليوم مفقود" };
  }
  if (!saisonDateDebut) {
    return { ok: false, error: "تاريخ بداية الموسم غير متوفر — تعذر عرض سجل الحضور" };
  }

  const ids = [...new Set((memberIds || []).filter(Boolean))];

  const theoreticalRes = await buildTheoreticalOccurrencesForSeance(
    seanceId,
    jour,
    heureDebut,
    saisonDateDebut,
    refDate
  );

  if (!theoreticalRes.ok) {
    return { ok: false, error: theoreticalRes.error, rows: [] };
  }

  const theoreticalOccurrences = theoreticalRes.sessionDates;
  const metaByDate = theoreticalRes.metaByDate;

  const recordedRes = await getDistinctPresenceDatesForSeance(seanceId);
  if (!recordedRes.ok) {
    return { ok: false, error: recordedRes.error, rows: [] };
  }

  const sessionDates = mergeSessionDates(
    theoreticalOccurrences,
    recordedRes.dates || []
  );

  if (sessionDates.length === 0) {
    return { ok: true, rows: [], markingContext: null };
  }

  const theoreticalSet = new Set(theoreticalOccurrences);
  const oldest = sessionDates[sessionDates.length - 1];
  const newest = sessionDates[0];
  const presRes = await getSeancePresenceForDateRange(seanceId, ids, oldest, newest);

  if (!presRes.ok) {
    return { ok: false, error: presRes.error, rows: [] };
  }
  if (presRes.degraded || recordedRes.degraded || theoreticalRes.degraded) {
    return {
      ok: false,
      error: "تعذر قراءة سجل الحضور من قاعدة البيانات",
      rows: [],
    };
  }

  const byDate = presRes.byDate || {};
  const rows = sessionDates.map((sessionDate) => {
    const dateMap = byDate[sessionDate] || {};
    const periodMeta = metaByDate.get(sessionDate);
    const occurrenceHeureDebut = periodMeta?.heureDebut ?? heureDebut ?? null;
    const fromRecordedOnly = !theoreticalSet.has(sessionDate);
    const isMarked = fromRecordedOnly
      ? true
      : ids.some((id) => {
          const s = dateMap[id];
          return s === "present" || s === "absent";
        });
    const windowOpen = fromRecordedOnly
      ? false
      : isOccurrenceMarkingWindowOpen(sessionDate, occurrenceHeureDebut, refDate);
    const markingWindowEnd = getOccurrenceWindowEnd(sessionDate, occurrenceHeureDebut);
    const { presentCount, absentCount, pct } = countPresenceStats(dateMap, ids);

    return {
      sessionDate,
      presentCount,
      absentCount,
      pct,
      isMarked,
      windowOpen,
      markingWindowEnd,
    };
  });

  const openRow = rows.find((r) => r.windowOpen) || null;
  let markingContext = null;
  if (openRow) {
    const dateMap = byDate[openRow.sessionDate] || {};
    const byMemberId = {};
    for (const id of ids) {
      const s = dateMap[id];
      byMemberId[id] = s === "present" || s === "absent" ? s : "unset";
    }
    markingContext = {
      sessionDate: openRow.sessionDate,
      isMarked: openRow.isMarked,
      markingWindowEnd: openRow.markingWindowEnd,
      byMemberId,
    };
  }

  return { ok: true, rows, markingContext };
}

/**
 * Enregistre ou met à jour la présence d'une séance pour une date (upsert UNIQUE membre_id, seance_id, date).
 * @param {string} seanceId
 * @param {string} sessionDateIso YYYY/MM/DD ou YYYY-MM-DD
 * @param {Record<string, 'present'|'absent'>} records
 * @returns {{ ok: boolean, error?: string }}
 */
export async function saveSeancePresence(seanceId, sessionDateIso, records = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId || !sessionDateIso) {
    return { ok: false, error: "معرّف الحصة أو التاريخ مفقود" };
  }

  const dbDate = String(sessionDateIso).slice(0, 10).replace(/\//g, "-");
  const rows = Object.entries(records)
    .filter(([membreId, status]) => membreId && (status === "present" || status === "absent"))
    .map(([membreId, status]) => ({
      membre_id: membreId,
      seance_id: seanceId,
      date: dbDate,
      statut: status,
    }));

  if (rows.length === 0) {
    return { ok: false, error: "لا توجد بيانات للحفظ" };
  }

  try {
    const { error } = await withTimeout(
      supabase.from("presences").upsert(rows, {
        onConflict: "membre_id,seance_id,date",
      }),
      SUPABASE_TIMEOUT_MS,
      "حفظ حضور الحصة"
    );

    if (error) {
      console.warn("[presenceApi] saveSeancePresence", error);
      return { ok: false, error: mapTableError(error, "presences") };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Détermine le mode d'affichage (marquage vs historique) pour la dernière occurrence de séance.
 * @returns {{
 *   ok: boolean,
 *   mode?: 'marking' | 'historical',
 *   sessionDate?: string|null,
 *   isMarked?: boolean,
 *   withinMarkingWindow?: boolean,
 *   markingWindowEnd?: string|null,
 *   byMemberId?: Record<string, 'present'|'absent'|'unset'>,
 *   error?: string
 * }}
 */
export async function getLatestSeanceOccurrenceStatus(
  seanceId,
  jourText,
  heureDebut = null,
  memberIds = []
) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }

  const occurrence = getLatestSeanceOccurrence(jourText, new Date(), heureDebut);
  if (!occurrence.sessionDate) {
    return {
      ok: true,
      mode: "historical",
      sessionDate: null,
      isMarked: false,
      withinMarkingWindow: false,
      markingWindowEnd: null,
      byMemberId: {},
    };
  }

  const ids = [...new Set((memberIds || []).filter(Boolean))];
  const presRes = await getSeancePresenceForDate(seanceId, occurrence.sessionDate, ids);

  if (!presRes.ok) {
    return { ok: false, error: presRes.error, byMemberId: presRes.byMemberId || {} };
  }

  const byMemberId = presRes.byMemberId || {};
  const isMarked = ids.some((id) => {
    const status = byMemberId[id];
    return status === "present" || status === "absent";
  });

  const mode = occurrence.withinMarkingWindow ? "marking" : "historical";

  return {
    ok: true,
    mode,
    sessionDate: occurrence.sessionDate,
    isMarked,
    withinMarkingWindow: occurrence.withinMarkingWindow,
    markingWindowEnd: occurrence.markingWindowEnd || null,
    byMemberId,
  };
}

/**
 * Rappel présence pour une occurrence (lecture presence_rappels, canal dédié — pas alerts).
 * @returns {{ ok: boolean, nbRappels?: number, error?: string, degraded?: boolean }}
 */
export async function getPresenceReminderForOccurrence(seanceId, sessionDateIso) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", nbRappels: 0 };
  }
  if (!seanceId || !sessionDateIso) {
    return { ok: false, error: "معرّف الحصة أو التاريخ مفقود", nbRappels: 0 };
  }

  const dbDate = slashDateToDb(sessionDateIso);

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("presence_rappels")
        .select("nb_rappels_envoyes")
        .eq("seance_id", seanceId)
        .eq("date", dbDate)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة تذكير الحضور"
    );

    if (error) {
      if (isTableMissingError(error)) {
        return { ok: true, nbRappels: 0, degraded: true };
      }
      return { ok: false, error: mapTableError(error, "presence_rappels"), nbRappels: 0 };
    }

    return { ok: true, nbRappels: data?.nb_rappels_envoyes ?? 0 };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", nbRappels: 0 };
  }
}

/**
 * (Admin) Totaux présence/absence d'une séance + résumé par date.
 * @returns {{ ok, presentCount, absentCount, sessionCount, byDateRows, error? }}
 */
export async function getSeancePresenceOverview(seanceId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("presences")
        .select("date, statut, membre_id")
        .eq("seance_id", seanceId),
      SUPABASE_TIMEOUT_MS,
      "قراءة حضور الحصة"
    );

    if (error) {
      if (
        isTableMissingError(error) ||
        /permission|row-level security|RLS|42501|violates row/i.test(error?.message || "")
      ) {
        return {
          ok: true,
          presentCount: 0,
          absentCount: 0,
          sessionCount: 0,
          byDateRows: [],
          degraded: true,
        };
      }
      return { ok: false, error: mapTableError(error, "presences") };
    }

    let presentCount = 0;
    let absentCount = 0;
    const byDate = {};

    for (const row of data || []) {
      const status = normalizePresenceStatus(row);
      if (status !== "present" && status !== "absent") continue;
      const dateKey = extractPresenceDate(row);
      if (!dateKey) continue;

      if (!byDate[dateKey]) {
        byDate[dateKey] = { presentCount: 0, absentCount: 0 };
      }
      if (status === "present") {
        presentCount += 1;
        byDate[dateKey].presentCount += 1;
      } else {
        absentCount += 1;
        byDate[dateKey].absentCount += 1;
      }
    }

    const byDateRows = Object.entries(byDate)
      .map(([sessionDate, stats]) => ({
        sessionDate,
        presentCount: stats.presentCount,
        absentCount: stats.absentCount,
        markedTotal: stats.presentCount + stats.absentCount,
      }))
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));

    return {
      ok: true,
      presentCount,
      absentCount,
      sessionCount: byDateRows.length,
      byDateRows,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
