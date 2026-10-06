import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

const SUPABASE_TIMEOUT_MS = 20000;

const MONTHS_AR = [
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

function asNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Libellé arabe d'une clé YYYY-MM. Une seule fonction pour toutes les courbes. */
export function monthLabelAr(key) {
  if (!key || String(key).length < 7) return key ? String(key) : "";
  const [y, m] = String(key).split("-");
  const idx = Math.max(0, Math.min(11, Number(m) - 1));
  const year = String(y || "");
  return `${MONTHS_AR[idx]} ${year}`;
}

function mapMonthSeries(rows, { progression = false } = {}) {
  if (!Array.isArray(rows)) return null;
  return rows.map((row) => {
    const value = progression
      ? asNumber(row?.avgPct ?? row?.pct)
      : asNumber(row?.pct ?? row?.avgPct);
    return {
      key: row?.key ?? null,
      label: monthLabelAr(row?.key),
      value,
      avgPct: progression ? value : asNumber(row?.avgPct),
      pct: progression ? asNumber(row?.pct) : value,
    };
  });
}

function mapCountSeries(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.map((row) => ({
    key: row?.key ?? null,
    count: asNumber(row?.count),
  }));
}

function isStatsRow(raw) {
  return raw != null && (raw.saison_id != null || raw.members_total != null);
}

/**
 * Un seul modèle de vue, que la source soit v2, v1 ou v1 rattrapé.
 * Un bloc absent vaut null. effectifs.retires n'est jamais recopié.
 */
export function normalizeSeasonStats(raw, meta = {}) {
  const row = isStatsRow(raw) ? raw : null;
  const details = row ? raw.details || {} : raw || {};
  const season = meta.season || {};
  const isV2 = Number(details.schemaVersion) === 2;
  const rattrapage = details.rattrapage?.source === "progression";

  const effectifs = buildEffectifs(details, row, isV2);
  const presence = buildPresence(details, row, isV2);
  const progression = buildProgression(details, row);
  const tests = buildTests(details, isV2);
  const objectifs = buildObjectifs(details, isV2);
  const bySeance = isV2
    ? Array.isArray(details.bySeance)
      ? details.bySeance
      : null
    : normalizeV1Seances(details.bySeance);
  const bySupervisor = Array.isArray(details.bySupervisor)
    ? details.bySupervisor
    : null;

  return {
    saisonId: season.id || row?.saison_id || details.saison?.id || null,
    name: season.name || details.saison?.name || "",
    type: season.type || details.saison?.type || null,
    active: season.active != null ? !!season.active : !!details.saison?.active,
    startDate: season.startDate || season.start_date || details.saison?.dateDebut || null,
    empty: false,
    source: meta.source || null,
    snapshotAt: meta.snapshotAt || row?.snapshot_at || null,
    rattrapage,
    effectifs,
    presence,
    progression,
    tests,
    objectifs,
    bySeance,
    bySupervisor,
    seancesTotal:
      asNumber(row?.seances_total) ??
      (Array.isArray(bySeance) ? bySeance.length : null),
    supervisorsTotal:
      asNumber(row?.supervisors_total) ??
      (Array.isArray(bySupervisor) ? bySupervisor.length : null),
  };
}

function buildEffectifs(details, row, isV2) {
  if (isV2) {
    if (!details.effectifs || typeof details.effectifs !== "object") return null;
    const src = details.effectifs;
    const demandes =
      src.demandes && typeof src.demandes === "object"
        ? {
            recues: asNumber(src.demandes.recues),
            acceptees: asNumber(src.demandes.acceptees),
            refusees: asNumber(src.demandes.refusees),
            enAttente: asNumber(src.demandes.enAttente),
          }
        : null;
    return {
      membres: asNumber(src.membres),
      male: asNumber(src.male),
      female: asNumber(src.female),
      nonSpecifie: asNumber(src.nonSpecifie),
      nouveaux: asNumber(src.nouveaux),
      renouvellements: asNumber(src.renouvellements),
      demandes,
      tauxAcceptation: asNumber(src.tauxAcceptation),
    };
  }
  if (!row) return null;
  const membres = asNumber(row.members_total);
  const male = asNumber(row.members_male);
  const female = asNumber(row.members_female);
  return {
    membres,
    male,
    female,
    nonSpecifie:
      membres == null || male == null || female == null
        ? null
        : Math.max(0, membres - male - female),
    nouveaux: null,
    renouvellements: null,
    demandes: null,
    tauxAcceptation: null,
  };
}

function markedTotal(bySeance) {
  if (!Array.isArray(bySeance) || bySeance.length === 0) return 0;
  return bySeance.reduce(
    (sum, seance) => sum + (Number(seance?.presenceMarked) || 0),
    0
  );
}

function normalizeV1Seances(bySeance) {
  if (!Array.isArray(bySeance)) return null;
  return bySeance.map((seance) => {
    const marked = Number(seance?.presenceMarked) || 0;
    if (marked > 0) return seance;
    return { ...seance, presencePct: null };
  });
}

function buildPresence(details, row, isV2) {
  if (isV2) {
    if (!details.presence || typeof details.presence !== "object") return null;
    const src = details.presence;
    const rep = src.repartition;
    return {
      pct: asNumber(src.pct),
      present: asNumber(src.present),
      absent: asNumber(src.absent),
      jours: asNumber(src.jours),
      parMois: mapMonthSeries(src.parMois, { progression: false }),
      repartition:
        rep && typeof rep === "object"
          ? {
              ge90: asNumber(rep.ge90),
              p75_90: asNumber(rep.p75_90),
              p50_75: asNumber(rep.p50_75),
              lt50: asNumber(rep.lt50),
              sansDonnees: asNumber(rep.sansDonnees),
            }
          : null,
    };
  }
  if (!row) return null;
  // L'ancien calcul client renvoyait 0 quand aucune présence n'était marquée.
  // Sans séance, ou si la somme des marques est 0, le bloc reste absent :
  // l'écran affiche « غير متوفر لهذا الموسم » au lieu d'un 0 %.
  if (markedTotal(details.bySeance) === 0) return null;
  return {
    pct: asNumber(row.avg_presence_pct),
    present: null,
    absent: null,
    jours: null,
    parMois: null,
    repartition: null,
  };
}

function buildProgression(details, row) {
  if (details.progression && typeof details.progression === "object") {
    const src = details.progression;
    const timeline = mapMonthSeries(
      src.timeline || details.progressTimeline,
      { progression: true }
    );
    return {
      avgPositionPct: asNumber(src.avgPositionPct),
      membresAvecDonnees: asNumber(src.membresAvecDonnees),
      gainMoyenHizb: asNumber(src.gainMoyenHizb),
      gainTotalHizb: asNumber(src.gainTotalHizb),
      khatm: asNumber(src.khatm),
      parTranche: mapCountSeries(src.parTranche),
      timeline,
    };
  }

  const timeline = mapMonthSeries(details.progressTimeline, { progression: true });
  const emptyTimeline = !timeline || timeline.length === 0;
  const avg = asNumber(row?.avg_progress_pct);
  // Bug historique : moyenne enregistrée à 0 sans aucune courbe. Ne pas l'afficher.
  if ((avg == null || avg === 0) && emptyTimeline) return null;
  return {
    avgPositionPct: avg,
    membresAvecDonnees: null,
    gainMoyenHizb: null,
    gainTotalHizb: null,
    khatm: null,
    parTranche: null,
    timeline,
  };
}

function buildTests(details, isV2) {
  const src = details.tests;
  if (!src || typeof src !== "object") return null;
  if (isV2) {
    return {
      count: asNumber(src.count),
      invites: asNumber(src.invites),
      notes: asNumber(src.notes),
      moyenne: asNumber(src.moyenne),
      min: asNumber(src.min),
      max: asNumber(src.max),
      distribution: mapCountSeries(src.distribution),
      parTest: Array.isArray(src.parTest) ? src.parTest : null,
    };
  }
  return {
    count: asNumber(src.count),
    invites: null,
    notes: asNumber(src.gradedCount),
    moyenne: asNumber(src.averageNote),
    min: null,
    max: null,
    distribution: null,
    parTest: null,
  };
}

function buildObjectifs(details, isV2) {
  const src = details.objectifs;
  if (!src || typeof src !== "object") return null;
  if (isV2) {
    return {
      fixes: asNumber(src.fixes),
      atteints: asNumber(src.atteints),
      taux: asNumber(src.taux),
      realisationMoyennePct: asNumber(src.realisationMoyennePct),
    };
  }
  return {
    fixes: asNumber(src.fixedCount),
    atteints: asNumber(src.achievedCount),
    taux: asNumber(src.achievementRate),
    realisationMoyennePct: null,
  };
}

function emptyView(season) {
  return {
    saisonId: season?.id || null,
    name: season?.name || "",
    type: season?.type || null,
    active: !!season?.active,
    startDate: season?.start_date || season?.startDate || null,
    empty: true,
    source: null,
    snapshotAt: null,
    rattrapage: false,
    effectifs: null,
    presence: null,
    progression: null,
    tests: null,
    objectifs: null,
    bySeance: null,
    bySupervisor: null,
    seancesTotal: null,
    supervisorsTotal: null,
  };
}

function seasonMeta(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    active: !!row.active,
    startDate: row.start_date || null,
  };
}

function chronoKey(view) {
  return String(view.startDate || view.snapshotAt || "");
}

/** Calcul en direct. Seule RPC de statistiques autorisée pour l'application. */
export async function fetchLiveSeasonStats(saisonId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!saisonId) {
    return { ok: false, error: "معرّف الموسم مفقود" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc("compute_season_stats", { p_saison_id: saisonId }),
      SUPABASE_TIMEOUT_MS,
      "حساب إحصائيات الموسم"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "compute_season_stats") };
    }
    if (data == null) {
      return { ok: false, error: "تعذر حساب الإحصائيات" };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

async function fetchSnapshotRow(saisonId) {
  const { data, error } = await withTimeout(
    supabase
      .from("season_stats")
      .select(
        "saison_id, members_total, members_male, members_female, seances_total, supervisors_total, avg_progress_pct, avg_presence_pct, snapshot_at, details"
      )
      .eq("saison_id", saisonId)
      .maybeSingle(),
    SUPABASE_TIMEOUT_MS,
    "قراءة إحصائيات الموسم"
  );
  if (error) {
    return { ok: false, error: mapTableError(error, "season_stats"), row: null };
  }
  return { ok: true, row: data || null };
}

/**
 * Saison active : calcul direct. Saison close : snapshot uniquement.
 * Sans ligne pour une saison close : empty, jamais de zéros à la place d'une erreur.
 */
export async function getSeasonStats(season) {
  if (!season?.id) {
    return { ok: false, error: "معرّف الموسم مفقود" };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }

  if (season.active) {
    const live = await fetchLiveSeasonStats(season.id);
    if (!live.ok) return { ok: false, error: live.error };
    return {
      ok: true,
      empty: false,
      view: normalizeSeasonStats(live.data, {
        source: "live",
        season: {
          id: season.id,
          name: season.name,
          type: season.type,
          active: true,
          startDate: season.startDate || season.start_date || null,
        },
      }),
    };
  }

  try {
    const snap = await fetchSnapshotRow(season.id);
    if (!snap.ok) return { ok: false, error: snap.error };
    if (!snap.row) return { ok: true, empty: true, view: null };
    return {
      ok: true,
      empty: false,
      view: normalizeSeasonStats(snap.row, {
        source: "snapshot",
        snapshotAt: snap.row.snapshot_at,
        season: {
          id: season.id,
          name: season.name,
          type: season.type,
          active: false,
          startDate: season.startDate || season.start_date || null,
        },
      }),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Saisons d'un type, avec snapshot, et le direct si la saison active est de ce type.
 * Tri chronologique (start_date, sinon snapshot_at). Une saison sans ligne reste, empty.
 */
export async function listSeasonStatsByType(type) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!type) {
    return { ok: false, error: "نوع الموسم مفقود" };
  }
  try {
    const seasonsRes = await withTimeout(
      supabase
        .from("saisons")
        .select("id, name, type, active, start_date")
        .eq("type", type),
      SUPABASE_TIMEOUT_MS,
      "قراءة المواسم"
    );
    if (seasonsRes.error) {
      return { ok: false, error: mapTableError(seasonsRes.error, "saisons") };
    }
    const seasons = seasonsRes.data || [];
    const ids = seasons.map((s) => s.id).filter(Boolean);
    let rows = [];
    if (ids.length) {
      const statsRes = await withTimeout(
        supabase
          .from("season_stats")
          .select(
            "saison_id, members_total, members_male, members_female, seances_total, supervisors_total, avg_progress_pct, avg_presence_pct, snapshot_at, details"
          )
          .in("saison_id", ids),
        SUPABASE_TIMEOUT_MS,
        "قراءة إحصائيات المواسم"
      );
      if (statsRes.error) {
        return { ok: false, error: mapTableError(statsRes.error, "season_stats") };
      }
      rows = statsRes.data || [];
    }
    const byId = new Map(rows.map((row) => [row.saison_id, row]));
    const active = seasons.find((s) => s.active) || null;
    let liveData = null;
    if (active) {
      const live = await fetchLiveSeasonStats(active.id);
      if (!live.ok) return { ok: false, error: live.error };
      liveData = live.data;
    }

    const views = seasons.map((season) => {
      const meta = seasonMeta(season);
      if (season.active && liveData) {
        return normalizeSeasonStats(liveData, { source: "live", season: meta });
      }
      const row = byId.get(season.id);
      if (!row) return emptyView(meta);
      return normalizeSeasonStats(row, {
        source: "snapshot",
        snapshotAt: row.snapshot_at,
        season: meta,
      });
    });
    views.sort((a, b) => chronoKey(a).localeCompare(chronoKey(b)));
    return { ok: true, seasons: views };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Historique membre : season_member_stats + nom / type / date de la saison. */
export async function getMemberSeasonHistory(membreId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", rows: [] };
  }
  if (!membreId) {
    return { ok: false, error: "معرّف العضو مفقود", rows: [] };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("season_member_stats")
        .select(
          "saison_id, seance_nom, superviseur_nom, presence_pct, pos_debut, pos_fin, gain_tumun, tests_invites, tests_notes, note_moyenne, objectif_cible, objectif_atteint, source, saisons(name, type, start_date)"
        )
        .eq("membre_id", membreId),
      SUPABASE_TIMEOUT_MS,
      "قراءة سجل المواسم"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "season_member_stats"), rows: [] };
    }
    const rows = (data || [])
      .map((row) => {
        const season = row.saisons || {};
        return {
          saisonId: row.saison_id,
          name: season.name || "",
          type: season.type || null,
          startDate: season.start_date || null,
          seanceNom: row.seance_nom || null,
          superviseurNom: row.superviseur_nom || null,
          presencePct: asNumber(row.presence_pct),
          posDebut: asNumber(row.pos_debut),
          posFin: asNumber(row.pos_fin),
          gainTumun: asNumber(row.gain_tumun),
          testsInvites: asNumber(row.tests_invites),
          testsNotes: asNumber(row.tests_notes),
          noteMoyenne: asNumber(row.note_moyenne),
          objectifCible: asNumber(row.objectif_cible),
          objectifAtteint:
            row.objectif_atteint == null ? null : !!row.objectif_atteint,
          source: row.source || null,
        };
      })
      .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", rows: [] };
  }
}
