import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { getAllAcceptedInscriptions } from "./seancesApi";
import { computeProgressMetrics } from "./progressApi";
import { getSeancePresenceOverview } from "./presenceApi";
import { formatGenderLabel } from "./membersApi";
import { displayProfileEmail } from "./authEmail";

const SUPABASE_TIMEOUT_MS = 20000;

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
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  return mapSupabaseAuthError(error);
}

function emptyTestStats() {
  return { count: 0, gradedCount: 0, averageNote: null };
}

function emptyObjectifStats() {
  return { fixedCount: 0, achievedCount: 0, achievementRate: null };
}

function emptyDetails() {
  return {
    bySeance: [],
    bySupervisor: [],
    progressTimeline: [],
    tests: emptyTestStats(),
    objectifs: emptyObjectifStats(),
  };
}

function emptyStats(saisonId) {
  return {
    saisonId,
    membersTotal: 0,
    membersMale: 0,
    membersFemale: 0,
    seancesTotal: 0,
    supervisorsTotal: 0,
    avgProgressPct: 0,
    avgPresencePct: 0,
    source: "empty",
    snapshotAt: null,
    details: emptyDetails(),
  };
}

function parseDetails(raw) {
  if (!raw || typeof raw !== "object") return emptyDetails();
  const tests = raw.tests && typeof raw.tests === "object" ? raw.tests : {};
  const objectifs =
    raw.objectifs && typeof raw.objectifs === "object" ? raw.objectifs : {};
  return {
    bySeance: Array.isArray(raw.bySeance) ? raw.bySeance : [],
    bySupervisor: Array.isArray(raw.bySupervisor) ? raw.bySupervisor : [],
    progressTimeline: Array.isArray(raw.progressTimeline)
      ? raw.progressTimeline
      : [],
    tests: {
      count: Number(tests.count) || 0,
      gradedCount: Number(tests.gradedCount) || 0,
      averageNote:
        tests.averageNote == null || tests.averageNote === ""
          ? null
          : Number(tests.averageNote),
    },
    objectifs: {
      fixedCount: Number(objectifs.fixedCount) || 0,
      achievedCount: Number(objectifs.achievedCount) || 0,
      achievementRate:
        objectifs.achievementRate == null || objectifs.achievementRate === ""
          ? null
          : Number(objectifs.achievementRate),
    },
  };
}

function rowToStats(row) {
  if (!row) return null;
  return {
    saisonId: row.saison_id,
    membersTotal: Number(row.members_total) || 0,
    membersMale: Number(row.members_male) || 0,
    membersFemale: Number(row.members_female) || 0,
    seancesTotal: Number(row.seances_total) || 0,
    supervisorsTotal: Number(row.supervisors_total) || 0,
    avgProgressPct: Math.round(Number(row.avg_progress_pct) || 0),
    avgPresencePct: Math.round(Number(row.avg_presence_pct) || 0),
    source: "snapshot",
    snapshotAt: row.snapshot_at || null,
    details: parseDetails(row.details),
  };
}

function statsToRow(stats) {
  return {
    saison_id: stats.saisonId,
    members_total: stats.membersTotal || 0,
    members_male: stats.membersMale || 0,
    members_female: stats.membersFemale || 0,
    seances_total: stats.seancesTotal || 0,
    supervisors_total: stats.supervisorsTotal || 0,
    avg_progress_pct: stats.avgProgressPct || 0,
    avg_presence_pct: stats.avgPresencePct || 0,
    details: stats.details || emptyDetails(),
    snapshot_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function monthKeyFromDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10).replace(/\//g, "-");
  if (s.length < 7) return null;
  return s.slice(0, 7);
}

function formatMonthLabel(ym) {
  if (!ym || ym.length < 7) return ym || "";
  const [y, m] = ym.split("-");
  const months = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];
  const idx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${months[idx]} ${String(y).slice(2)}`;
}

async function fetchSeasonSeances(saisonId) {
  const { data, error } = await withTimeout(
    supabase
      .from("seances")
      .select("id, nom, genre, superviseur_id, statut, saison_id")
      .eq("saison_id", saisonId),
    SUPABASE_TIMEOUT_MS,
    "قراءة حصص الموسم"
  );
  if (error) {
    return { ok: false, error: mapTableError(error, "seances"), seances: [] };
  }
  return { ok: true, seances: data || [] };
}

async function fetchProfilesByIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await withTimeout(
    supabase
      .from("profiles")
      .select("id, first_name, last_name, email, canonical_email")
      .in("id", unique),
    SUPABASE_TIMEOUT_MS,
    "قراءة المشرفين"
  );
  if (error) return {};
  const map = {};
  for (const p of data || []) {
    const name =
      `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
      displayProfileEmail(p) ||
      "مشرف";
    map[p.id] = name;
  }
  return map;
}

async function fetchLatestProgressForMembers(memberIds) {
  if (!memberIds.length) return { ok: true, byMember: {}, rows: [] };

  const { data, error } = await withTimeout(
    supabase
      .from("progression")
      .select(
        "membre_id, nb_hizb_completes, tumun_courant, juze, tumun, date_saisie, date, saison_id, id"
      )
      .in("membre_id", memberIds)
      .order("date", { ascending: false })
      .order("id", { ascending: false }),
    SUPABASE_TIMEOUT_MS,
    "قراءة تقدم الأعضاء"
  );

  if (error) {
    if (/column.*does not exist|date_saisie/i.test(error?.message || "")) {
      const fb = await withTimeout(
        supabase
          .from("progression")
          .select(
            "membre_id, nb_hizb_completes, tumun_courant, juze, tumun, date, saison_id, id"
          )
          .in("membre_id", memberIds)
          .order("date", { ascending: false })
          .order("id", { ascending: false }),
        SUPABASE_TIMEOUT_MS,
        "قراءة تقدم الأعضاء"
      );
      if (fb.error) {
        return {
          ok: false,
          error: mapTableError(fb.error, "progression"),
          byMember: {},
          rows: [],
        };
      }
      const rows = fb.data || [];
      const byMember = {};
      for (const row of rows) {
        if (!byMember[row.membre_id]) byMember[row.membre_id] = row;
      }
      return { ok: true, byMember, rows };
    }
    return {
      ok: false,
      error: mapTableError(error, "progression"),
      byMember: {},
      rows: [],
    };
  }

  const rows = data || [];
  const byMember = {};
  for (const row of rows) {
    if (!byMember[row.membre_id]) byMember[row.membre_id] = row;
  }
  return { ok: true, byMember, rows };
}

async function fetchGenresFromApplications(memberIds, saisonId) {
  if (!memberIds.length) return {};
  try {
    let query = supabase
      .from("member_applications")
      .select("user_id, genre, season_id, updated_at")
      .in("user_id", memberIds)
      .order("updated_at", { ascending: false });
    if (saisonId) {
      query = query.eq("season_id", saisonId);
    }
    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "قراءة جنس الأعضاء"
    );
    if (error) return {};
    const byUser = {};
    for (const row of data || []) {
      if (!byUser[row.user_id] && row.genre) {
        byUser[row.user_id] = formatGenderLabel(row.genre);
      }
    }
    return byUser;
  } catch {
    return {};
  }
}

function buildProgressTimeline(rows, saisonId, memberIds) {
  const memberSet = new Set(memberIds);
  const byMonth = {};

  for (const row of rows || []) {
    if (!memberSet.has(row.membre_id)) continue;
    if (saisonId && row.saison_id && row.saison_id !== saisonId) continue;
    const mk = monthKeyFromDate(row.date_saisie || row.date);
    if (!mk) continue;
    const metrics = computeProgressMetrics(row);
    if (!metrics) continue;
    if (!byMonth[mk]) byMonth[mk] = {};
    // dernière saisie du mois par membre (rows are desc if ordered)
    if (byMonth[mk][row.membre_id] == null) {
      byMonth[mk][row.membre_id] = metrics.globalPct || 0;
    }
  }

  return Object.keys(byMonth)
    .sort()
    .map((mk) => {
      const vals = Object.values(byMonth[mk]);
      const avg =
        vals.length === 0
          ? 0
          : Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      return { key: mk, label: formatMonthLabel(mk), avgPct: avg };
    });
}

/**
 * Filtre les stats d'une saison selon حصة / مشرف (sans mélanger d'autres saisons).
 */
export function applySeasonStatsFilters(stats, { seanceId = null, supervisorId = null } = {}) {
  if (!stats) return emptyStats(null);
  const details = stats.details || emptyDetails();
  let seances = details.bySeance || [];

  if (supervisorId) {
    seances = seances.filter((s) => s.supervisorId === supervisorId);
  }
  if (seanceId) {
    seances = seances.filter((s) => s.id === seanceId);
  }

  if (!seanceId && !supervisorId) {
    return stats;
  }

  const membersTotal = seances.reduce((n, s) => n + (s.membersCount || 0), 0);
  const membersMale = seances.reduce((n, s) => n + (s.membersMale || 0), 0);
  const membersFemale = seances.reduce((n, s) => n + (s.membersFemale || 0), 0);
  const supervisorIds = new Set(seances.map((s) => s.supervisorId).filter(Boolean));

  let weightProgress = 0;
  let sumProgress = 0;
  let weightPresence = 0;
  let sumPresence = 0;
  for (const s of seances) {
    const mc = s.membersCount || 0;
    if (mc > 0 && s.avgProgressPct != null) {
      sumProgress += (s.avgProgressPct || 0) * mc;
      weightProgress += mc;
    }
    const marked = s.presenceMarked || 0;
    if (marked > 0 && s.presencePct != null) {
      sumPresence += (s.presencePct || 0) * marked;
      weightPresence += marked;
    }
  }

  const supervisors =
    details.bySupervisor?.filter((sup) => {
      if (supervisorId) return sup.id === supervisorId;
      return supervisorIds.has(sup.id);
    }) || [];

  return {
    ...stats,
    membersTotal,
    membersMale,
    membersFemale,
    seancesTotal: seances.length,
    supervisorsTotal: supervisorIds.size,
    avgProgressPct:
      weightProgress > 0 ? Math.round(sumProgress / weightProgress) : 0,
    avgPresencePct:
      weightPresence > 0 ? Math.round(sumPresence / weightPresence) : 0,
    details: {
      ...details,
      bySeance: seances,
      bySupervisor: supervisors,
    },
  };
}

/** Tests de la saison : nombre, invitations notées, moyenne des notes. */
async function fetchSeasonTestStats(saisonId) {
  const testsRes = await withTimeout(
    supabase.from("tests").select("id").eq("saison_id", saisonId),
    SUPABASE_TIMEOUT_MS,
    "قراءة اختبارات الموسم"
  );
  if (testsRes.error) {
    return { ok: false, error: mapTableError(testsRes.error, "tests") };
  }
  const ids = (testsRes.data || []).map((row) => row.id).filter(Boolean);
  if (ids.length === 0) {
    return { ok: true, summary: emptyTestStats() };
  }
  const invRes = await withTimeout(
    supabase
      .from("test_invitations")
      .select("statut, note")
      .in("test_id", ids),
    SUPABASE_TIMEOUT_MS,
    "قراءة درجات الاختبارات"
  );
  if (invRes.error) {
    return { ok: false, error: mapTableError(invRes.error, "test_invitations") };
  }
  const graded = (invRes.data || []).filter(
    (row) => row.statut === "note" && row.note != null && row.note !== ""
  );
  const averageNote =
    graded.length === 0
      ? null
      : Math.round(
          (graded.reduce((sum, row) => sum + Number(row.note), 0) / graded.length) *
            10
        ) / 10;
  return {
    ok: true,
    summary: {
      count: ids.length,
      gradedCount: graded.length,
      averageNote: Number.isFinite(averageNote) ? averageNote : null,
    },
  };
}

async function fetchSeasonObjectifRows(saisonId) {
  const { data, error } = await withTimeout(
    supabase
      .from("objectifs")
      .select("membre_id, nb_hizb_cible, nb_hizb_depart")
      .eq("saison_id", saisonId),
    SUPABASE_TIMEOUT_MS,
    "قراءة أهداف الموسم"
  );
  if (error) {
    return { ok: false, error: mapTableError(error, "objectifs"), rows: [] };
  }
  return { ok: true, rows: data || [] };
}

/**
 * Atteint si position actuelle − nb_hizb_depart ≥ nb_hizb_cible.
 * Position = dernier progression.nb_hizb_completes du membre (0 si aucune ligne).
 */
function summarizeObjectifs(rows, progressByMember) {
  let achievedCount = 0;
  for (const row of rows || []) {
    const cible = Number(row.nb_hizb_cible);
    const depart = Number(row.nb_hizb_depart);
    const raw = progressByMember[row.membre_id]?.nb_hizb_completes;
    const position = Number.isFinite(Number(raw)) ? Number(raw) : 0;
    const start = Number.isFinite(depart) ? depart : 0;
    if (Number.isFinite(cible) && position - start >= cible) achievedCount += 1;
  }
  const fixedCount = (rows || []).length;
  return {
    fixedCount,
    achievedCount,
    achievementRate:
      fixedCount === 0 ? null : Math.round((achievedCount / fixedCount) * 100),
  };
}

/**
 * Calcule les statistiques live d'un musim (données actuelles en base).
 * Toutes les séances de la saison comptent, y compris statut = archivee :
 * le snapshot est pris avant la purge de fin de saison.
 */
export async function computeSeasonStats(saisonId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", stats: emptyStats(saisonId) };
  }
  if (!saisonId) {
    return { ok: false, error: "معرّف الموسم مفقود", stats: emptyStats(saisonId) };
  }

  try {
    const [seancesRes, inscRes] = await Promise.all([
      fetchSeasonSeances(saisonId),
      getAllAcceptedInscriptions({ saisonId }),
    ]);

    if (!seancesRes.ok) {
      return { ok: false, error: seancesRes.error, stats: emptyStats(saisonId) };
    }

    const seances = seancesRes.seances || [];
    const configuredSeances = seances;
    const seanceById = Object.fromEntries(seances.map((s) => [s.id, s]));
    const supervisorIds = [
      ...new Set(configuredSeances.map((s) => s.superviseur_id).filter(Boolean)),
    ];
    const supervisorNames = await fetchProfilesByIds(supervisorIds);

    const inscriptions = inscRes.ok ? inscRes.inscriptions || [] : [];
    const memberIds = [
      ...new Set(inscriptions.map((i) => i.membre_id).filter(Boolean)),
    ];

    const membersBySeance = {};
    for (const s of configuredSeances) membersBySeance[s.id] = [];
    for (const insc of inscriptions) {
      if (!insc.seance_id) continue;
      if (!membersBySeance[insc.seance_id]) membersBySeance[insc.seance_id] = [];
      membersBySeance[insc.seance_id].push(insc.membre_id);
    }

    const appGenres = await fetchGenresFromApplications(memberIds, saisonId);
    const genderByMember = {};
    for (const insc of inscriptions) {
      if (genderByMember[insc.membre_id]) continue;
      const seanceGenre = formatGenderLabel(seanceById[insc.seance_id]?.genre);
      const genre = seanceGenre || appGenres[insc.membre_id] || null;
      if (genre) genderByMember[insc.membre_id] = genre;
    }
    let membersMale = 0;
    let membersFemale = 0;
    for (const mid of memberIds) {
      const genre = genderByMember[mid];
      if (genre === "ذكر") membersMale += 1;
      else if (genre === "أنثى") membersFemale += 1;
    }

    const objectifsRes = await fetchSeasonObjectifRows(saisonId);
    if (!objectifsRes.ok) {
      return { ok: false, error: objectifsRes.error, stats: emptyStats(saisonId) };
    }
    const testsRes = await fetchSeasonTestStats(saisonId);
    if (!testsRes.ok) {
      return { ok: false, error: testsRes.error, stats: emptyStats(saisonId) };
    }
    const progressMemberIds = [
      ...new Set([
        ...memberIds,
        ...objectifsRes.rows.map((row) => row.membre_id).filter(Boolean),
      ]),
    ];

    const progRes = await fetchLatestProgressForMembers(progressMemberIds);
    const progressByMember = progRes.ok ? progRes.byMember : {};
    const progressPct = (id) => {
      const m = computeProgressMetrics(progressByMember[id]);
      return m ? m.globalPct || 0 : null;
    };

    let avgProgressPct = 0;
    if (progRes.ok) {
      const pcts = memberIds
        .map((id) => progressPct(id))
        .filter((v) => v != null);
      avgProgressPct =
        pcts.length === 0
          ? 0
          : Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    }

    const presenceResults = await Promise.all(
      configuredSeances.map((s) => getSeancePresenceOverview(s.id))
    );

    let totalPresent = 0;
    let totalAbsent = 0;
    const bySeance = configuredSeances.map((s, idx) => {
      const memberList = [...new Set(membersBySeance[s.id] || [])];
      let male = 0;
      let female = 0;
      const pcts = [];
      for (const mid of memberList) {
        const g = genderByMember[mid];
        if (g === "ذكر") male += 1;
        else if (g === "أنثى") female += 1;
        const p = progressPct(mid);
        if (p != null) pcts.push(p);
      }
      const presence = presenceResults[idx];
      const presentCount = presence?.ok ? presence.presentCount || 0 : 0;
      const absentCount = presence?.ok ? presence.absentCount || 0 : 0;
      const marked = presentCount + absentCount;
      totalPresent += presentCount;
      totalAbsent += absentCount;

      return {
        id: s.id,
        name: s.nom || "حصة",
        genre: formatGenderLabel(s.genre) || null,
        supervisorId: s.superviseur_id || null,
        supervisorName: s.superviseur_id
          ? supervisorNames[s.superviseur_id] || "مشرف"
          : "—",
        membersCount: memberList.length,
        membersMale: male,
        membersFemale: female,
        avgProgressPct:
          pcts.length === 0
            ? 0
            : Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
        presencePct: marked > 0 ? Math.round((presentCount / marked) * 100) : 0,
        presenceMarked: marked,
        sessionCount: presence?.ok ? presence.sessionCount || 0 : 0,
      };
    });

    const bySupervisorMap = {};
    for (const s of bySeance) {
      if (!s.supervisorId) continue;
      if (!bySupervisorMap[s.supervisorId]) {
        bySupervisorMap[s.supervisorId] = {
          id: s.supervisorId,
          name: s.supervisorName,
          seancesCount: 0,
          membersCount: 0,
          progressWeighted: 0,
          progressWeight: 0,
          presenceWeighted: 0,
          presenceWeight: 0,
        };
      }
      const bucket = bySupervisorMap[s.supervisorId];
      bucket.seancesCount += 1;
      bucket.membersCount += s.membersCount || 0;
      if ((s.membersCount || 0) > 0) {
        bucket.progressWeighted += (s.avgProgressPct || 0) * s.membersCount;
        bucket.progressWeight += s.membersCount;
      }
      if ((s.presenceMarked || 0) > 0) {
        bucket.presenceWeighted += (s.presencePct || 0) * s.presenceMarked;
        bucket.presenceWeight += s.presenceMarked;
      }
    }

    const bySupervisor = Object.values(bySupervisorMap).map((b) => ({
      id: b.id,
      name: b.name,
      seancesCount: b.seancesCount,
      membersCount: b.membersCount,
      avgProgressPct:
        b.progressWeight > 0
          ? Math.round(b.progressWeighted / b.progressWeight)
          : 0,
      avgPresencePct:
        b.presenceWeight > 0
          ? Math.round(b.presenceWeighted / b.presenceWeight)
          : 0,
    }));

    const marked = totalPresent + totalAbsent;
    const avgPresencePct =
      marked > 0 ? Math.round((totalPresent / marked) * 100) : 0;

    const progressTimeline = buildProgressTimeline(
      progRes.rows || [],
      saisonId,
      memberIds
    );

    return {
      ok: true,
      stats: {
        saisonId,
        membersTotal: memberIds.length,
        membersMale,
        membersFemale,
        seancesTotal: configuredSeances.length,
        supervisorsTotal: supervisorIds.length,
        avgProgressPct,
        avgPresencePct,
        source: "live",
        snapshotAt: null,
        details: {
          bySeance,
          bySupervisor,
          progressTimeline,
          tests: testsRes.summary,
          objectifs: summarizeObjectifs(objectifsRes.rows, progressByMember),
        },
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر حساب الإحصائيات",
      stats: emptyStats(saisonId),
    };
  }
}

/** Charge un snapshot figé (s'il existe). */
export async function fetchSeasonStatsSnapshot(saisonId) {
  if (!isSupabaseConfigured() || !saisonId) {
    return { ok: true, stats: null };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("season_stats")
        .select("*")
        .eq("saison_id", saisonId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة إحصائيات الموسم"
    );
    if (error) {
      if (/relation.*does not exist|Could not find the table/i.test(error?.message || "")) {
        return { ok: true, stats: null, tableMissing: true };
      }
      return { ok: false, error: mapTableError(error, "season_stats"), stats: null };
    }
    return { ok: true, stats: rowToStats(data) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", stats: null };
  }
}

/** Enregistre / met à jour le snapshot d'un musim. */
export async function saveSeasonStatsSnapshot(stats) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!stats?.saisonId) {
    return { ok: false, error: "معرّف الموسم مفقود" };
  }
  try {
    const row = statsToRow(stats);
    let { data, error } = await withTimeout(
      supabase
        .from("season_stats")
        .upsert(row, { onConflict: "saison_id" })
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ إحصائيات الموسم"
    );

    // Bases sans colonne details (migration 0044 non exécutée)
    if (error && /details|column.*does not exist/i.test(error?.message || "")) {
      const { details: _d, ...rowWithoutDetails } = row;
      ({ data, error } = await withTimeout(
        supabase
          .from("season_stats")
          .upsert(rowWithoutDetails, { onConflict: "saison_id" })
          .select("*")
          .single(),
        SUPABASE_TIMEOUT_MS,
        "حفظ إحصائيات الموسم"
      ));
    }

    if (error) {
      return { ok: false, error: mapTableError(error, "season_stats") };
    }
    return { ok: true, stats: rowToStats(data) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر حفظ الإحصائيات" };
  }
}

/**
 * Saison close : lecture du snapshot uniquement, jamais de recalcul.
 * Sans ligne season_stats → missing, aucun calcul en direct.
 */
export async function getSeasonStats(
  saisonId,
  { preferLive = false, seasonActive = false } = {}
) {
  if (!saisonId) {
    return { ok: false, error: "معرّف الموسم مفقود", stats: emptyStats(saisonId) };
  }

  if (!preferLive && !seasonActive) {
    const snap = await fetchSeasonStatsSnapshot(saisonId);
    if (!snap.ok) {
      return { ok: false, error: snap.error, stats: emptyStats(saisonId) };
    }
    if (!snap.stats) {
      return {
        ok: true,
        missing: true,
        stats: null,
        error: "لا توجد إحصائيات محفوظة لهذا الموسم",
      };
    }
    return { ok: true, stats: snap.stats };
  }

  return computeSeasonStats(saisonId);
}

/**
 * Fige les ids donnés. N'appelle pas cette fonction avec une saison déjà
 * close qui a déjà un snapshot : le recalcul écraserait l'historique.
 */
export async function snapshotSeasonsBeforeClose(saisonIds = []) {
  const ids = [...new Set((saisonIds || []).filter(Boolean))];
  if (!ids.length) return { ok: true, saved: 0 };

  let saved = 0;
  const errors = [];
  for (const id of ids) {
    const live = await computeSeasonStats(id);
    if (!live.ok) {
      errors.push(live.error || id);
      continue;
    }
    const save = await saveSeasonStatsSnapshot(live.stats);
    if (save.ok) saved += 1;
    else errors.push(save.error || id);
  }
  return {
    ok: errors.length === 0,
    saved,
    error: errors.length ? errors.join(" — ") : null,
  };
}

/**
 * Avant start_new_season :
 * - chaque saison active (regular et summer) ;
 * - chaque saison close qui a encore au moins une séance et aucune ligne
 *   season_stats (rattrapage unique, jamais une saison close déjà figée).
 */
export async function snapshotBeforeNewSeason() {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true, saved: 0 };
  }
  try {
    const [seasonsRes, statsRes, seancesRes] = await Promise.all([
      withTimeout(
        supabase.from("saisons").select("id, active"),
        SUPABASE_TIMEOUT_MS,
        "قراءة المواسم"
      ),
      withTimeout(
        supabase.from("season_stats").select("saison_id"),
        SUPABASE_TIMEOUT_MS,
        "قراءة إحصائيات المواسم"
      ),
      withTimeout(
        supabase.from("seances").select("saison_id"),
        SUPABASE_TIMEOUT_MS,
        "قراءة حصص المواسم"
      ),
    ]);
    if (seasonsRes.error) {
      return { ok: false, error: mapTableError(seasonsRes.error, "saisons") };
    }
    if (statsRes.error) {
      return { ok: false, error: mapTableError(statsRes.error, "season_stats") };
    }
    if (seancesRes.error) {
      return { ok: false, error: mapTableError(seancesRes.error, "seances") };
    }

    const seasons = seasonsRes.data || [];
    const haveStats = new Set(
      (statsRes.data || []).map((row) => row.saison_id).filter(Boolean)
    );
    const withSeances = new Set(
      (seancesRes.data || []).map((row) => row.saison_id).filter(Boolean)
    );
    const activeIds = seasons.filter((row) => row.active).map((row) => row.id);
    const catchupIds = seasons
      .filter(
        (row) => !row.active && withSeances.has(row.id) && !haveStats.has(row.id)
      )
      .map((row) => row.id);
    return snapshotSeasonsBeforeClose([...activeIds, ...catchupIds]);
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر حفظ إحصائيات الموسم" };
  }
}
