import { Alert } from "react-native";
import { SEASON_TYPES } from "../constants/roles";
import { STATS_LABELS } from "./statsLabels";
import { monthLabelAr } from "./seasonStatsApi";

const PRIMARY = "#2E7D32";
const YELLOW = "#FFD666";
const TRACK = "#F0F0F0";
const RED = "#D32F2F";
const MUTED = "#666666";
const BORDER = "#E0E0E0";
const SOFT = "#E8F5E9";

const JUZ_BAND_LABELS = {
  "0-5": STATS_LABELS.juz0_5,
  "5-10": STATS_LABELS.juz5_10,
  "10-15": STATS_LABELS.juz10_15,
  "15-20": STATS_LABELS.juz15_20,
  "20-25": STATS_LABELS.juz20_25,
  "25-30": STATS_LABELS.juz25_30,
};

const PRESENCE_BANDS = [
  { key: "ge90", label: STATS_LABELS.band90 },
  { key: "p75_90", label: STATS_LABELS.band75 },
  { key: "p50_75", label: STATS_LABELS.band50 },
  { key: "lt50", label: STATS_LABELS.bandUnder50 },
  { key: "sansDonnees", label: STATS_LABELS.bandNoData },
];

const COMPARE_INDICATORS = [
  { key: "members", label: STATS_LABELS.members, suffix: "" },
  { key: "presence", label: STATS_LABELS.comparePresence, suffix: "" },
  { key: "gain", label: STATS_LABELS.compareGain, suffix: ` ${STATS_LABELS.unitHizb}` },
  { key: "tests", label: STATS_LABELS.compareTests, suffix: "" },
  { key: "objectifs", label: STATS_LABELS.compareObjectifs, suffix: "" },
];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dash(value) {
  return value == null || value === "" ? "—" : String(value);
}

function dashPct(value) {
  return value == null ? "—" : `${value}${STATS_LABELS.unitPercent}`;
}

function oneDecimal(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * 10) / 10);
}

function wholeNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n));
}

function formatHizbOne(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const text = `${(Math.round(n * 10) / 10).toFixed(1)} ${STATS_LABELS.unitHizb}`;
  return n < 0 ? `\u200E${text}` : text;
}

function positionHizbHint(pct) {
  if (pct == null || pct === "") return null;
  const n = Number(pct);
  if (!Number.isFinite(n)) return null;
  return STATS_LABELS.positionHint.replace("{value}", ((n * 60) / 100).toFixed(1));
}

function hizbFromTumun(tumun) {
  if (tumun == null || tumun === "") return "—";
  const n = Number(tumun) / 8;
  if (!Number.isFinite(n)) return "—";
  const text = `${(Math.round(n * 10) / 10).toFixed(1)} ${STATS_LABELS.unitHizb}`;
  return n < 0 ? `\u200E${text}` : text;
}

function formatDate(value) {
  if (value == null || value === "") return "—";
  const text = String(value).slice(0, 10);
  return text || "—";
}

function todayStamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function seasonTypeLabel(type) {
  return type === SEASON_TYPES.SUMMER ? STATS_LABELS.seasonSummer : STATS_LABELS.seasonRegular;
}

function compareTypeLabel(type) {
  return type === SEASON_TYPES.SUMMER ? STATS_LABELS.seasonsSummer : STATS_LABELS.seasonsRegular;
}

function unavailable() {
  return `<p class="muted">${esc(STATS_LABELS.unavailable)}</p>`;
}

function section(title, body) {
  return `<section class="block"><h2>${esc(title)}</h2>${body}</section>`;
}

function factsHtml(rows) {
  return `<div class="facts">${rows
    .map(
      (row) =>
        `<div class="fact"><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong></div>`
    )
    .join("")}</div>`;
}

function deltaHtml(current, previous) {
  if (current == null || previous == null) return "";
  const diff = Math.round((Number(current) - Number(previous)) * 100) / 100;
  if (!Number.isFinite(diff)) return "";
  if (diff === 0) return `<span class="delta eq">=</span>`;
  const up = diff > 0;
  return `<span class="delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${esc(Math.abs(diff))}</span>`;
}

function kpiCard(label, value, unit, delta) {
  const shown = value == null ? "—" : esc(value);
  const unitHtml = value != null && unit ? `<span class="unit">${esc(unit)}</span>` : "";
  return `<div class="kpi"><div class="kpi-top">${delta || ""}</div><div class="kpi-value">${shown}${unitHtml}</div><div class="kpi-label">${esc(label)}</div></div>`;
}

function barsHtml(items, { color = PRIMARY, formatValue } = {}) {
  const positive = items
    .map((item) => Number(item.value))
    .filter((n) => Number.isFinite(n) && n > 0);
  const max = positive.length ? Math.max(...positive) : 0;
  const cols = items
    .map((item) => {
      const raw = item.value;
      const missing = raw == null || raw === "" || !Number.isFinite(Number(raw));
      const n = missing ? null : Number(raw);
      const negative = n != null && n < 0;
      const height = !missing && !negative && n > 0 && max > 0 ? Math.round((n / max) * 100) : 0;
      let text = "—";
      if (!missing) {
        text = formatValue ? formatValue(n) : String(n);
      }
      const caption = item.caption ? `<div class="bar-caption">${esc(item.caption)}</div>` : "";
      return `<div class="bar-col"><div class="bar-value${negative ? " neg" : ""}">${esc(text)}</div><div class="track"><div class="fill" style="height:${height}%;background:${color}"></div></div><div class="bar-label">${esc(item.label || "")}</div>${caption}</div>`;
    })
    .join("");
  return `<div class="bars">${cols}</div>`;
}

function seriesBars(series, suffix) {
  return barsHtml(
    (series || []).map((point) => ({
      label: point.label || monthLabelAr(point.key),
      value: point.value,
    })),
    {
      color: PRIMARY,
      formatValue: (n) => `${n}${suffix || ""}`,
    }
  );
}

function countBars(items, color) {
  return barsHtml(items, {
    color,
    formatValue: (n) => String(Math.round(n)),
  });
}

function seanceNamesForSupervisor(bySeance, supervisorId) {
  if (!supervisorId || !Array.isArray(bySeance)) return [];
  return bySeance
    .filter((seance) => (seance.supervisorId || seance.supervisor_id) === supervisorId)
    .map((seance) => seance.name)
    .filter(Boolean);
}

function effectifsHtml(effectifs) {
  if (effectifs == null) return unavailable();
  const segments = [
    { key: "male", label: STATS_LABELS.male, value: effectifs.male },
    { key: "female", label: STATS_LABELS.female, value: effectifs.female },
    { key: "other", label: STATS_LABELS.unspecified, value: effectifs.nonSpecifie },
  ].filter((segment) => {
    if (segment.value == null) return false;
    if (segment.key === "other" && Number(segment.value) === 0) return false;
    return true;
  });
  const chart = segments.length
    ? countBars(
        segments.map((segment) => ({ label: segment.label, value: segment.value })),
        PRIMARY
      )
    : "";
  return (
    factsHtml([{ label: STATS_LABELS.total, value: dash(effectifs.membres) }]) +
    chart +
    factsHtml([
      { label: STATS_LABELS.newMembers, value: dash(effectifs.nouveaux) },
      { label: STATS_LABELS.renewals, value: dash(effectifs.renouvellements) },
      { label: STATS_LABELS.requestsReceived, value: dash(effectifs.demandes?.recues) },
      { label: STATS_LABELS.requestsAccepted, value: dash(effectifs.demandes?.acceptees) },
      { label: STATS_LABELS.requestsRejected, value: dash(effectifs.demandes?.refusees) },
      { label: STATS_LABELS.requestsPending, value: dash(effectifs.demandes?.enAttente) },
      { label: STATS_LABELS.acceptanceRate, value: dashPct(effectifs.tauxAcceptation) },
    ])
  );
}

function presenceHtml(presence) {
  if (presence == null) return unavailable();
  const facts = factsHtml([
    { label: STATS_LABELS.presenceRateFact, value: dashPct(presence.pct) },
    { label: STATS_LABELS.daysCount, value: dash(presence.jours) },
    { label: STATS_LABELS.present, value: dash(presence.present) },
    { label: STATS_LABELS.absent, value: dash(presence.absent) },
  ]);
  const curve =
    presence.parMois == null
      ? unavailable()
      : `<h3>${esc(STATS_LABELS.presenceCurve)}</h3>${seriesBars(presence.parMois, STATS_LABELS.unitPercent)}`;
  const bands =
    presence.repartition == null
      ? unavailable()
      : `<h3>${esc(STATS_LABELS.presenceDistribution)}</h3>${countBars(
          PRESENCE_BANDS.map((band) => ({
            label: band.label,
            value: presence.repartition[band.key],
          })),
          YELLOW
        )}`;
  return facts + curve + bands;
}

function progressionHtml(stats) {
  const progression = stats?.progression;
  const note = stats?.rattrapage
    ? `<p class="note">${esc(STATS_LABELS.rattrapageNote)}</p>`
    : "";
  if (progression == null) return note + unavailable();
  const hint = positionHizbHint(progression.avgPositionPct);
  const gaugeLabel = stats?.rattrapage ? STATS_LABELS.positionEnd : STATS_LABELS.avgQuran;
  const gaugeValue = dashPct(progression.avgPositionPct);
  const gauge = factsHtml([
    { label: gaugeLabel, value: hint ? `${gaugeValue} ${hint}` : gaugeValue },
  ]);
  const facts = factsHtml([
    { label: STATS_LABELS.gainNew, value: formatHizbOne(progression.gainMoyenHizb) },
    { label: STATS_LABELS.gainTotal, value: formatHizbOne(progression.gainTotalHizb) },
    { label: STATS_LABELS.khatmCount, value: dash(progression.khatm) },
    { label: STATS_LABELS.membersWithProgress, value: dash(progression.membresAvecDonnees) },
  ]);
  const curve =
    progression.timeline == null
      ? unavailable()
      : `<h3>${esc(STATS_LABELS.progressCurve)}</h3>${seriesBars(progression.timeline, STATS_LABELS.unitPercent)}`;
  const bands =
    progression.parTranche == null
      ? unavailable()
      : `<h3>${esc(STATS_LABELS.juzDistribution)}</h3>${countBars(
          progression.parTranche.map((band) => ({
            label: JUZ_BAND_LABELS[band.key] || band.key || "",
            value: band.count,
          })),
          YELLOW
        )}`;
  return `${note}${gauge}<h3>${esc(STATS_LABELS.gainDuringSeason)}</h3>${facts}${curve}${bands}`;
}

function testsHtml(tests) {
  if (tests == null) return unavailable();
  const facts = factsHtml([
    { label: STATS_LABELS.testsCount, value: dash(tests.count) },
    { label: STATS_LABELS.invited, value: dash(tests.invites) },
    { label: STATS_LABELS.graded, value: dash(tests.notes) },
    { label: STATS_LABELS.averageOutOf20, value: dash(tests.moyenne) },
    { label: STATS_LABELS.minOutOf20, value: dash(tests.min) },
    { label: STATS_LABELS.maxOutOf20, value: dash(tests.max) },
  ]);
  const chart =
    tests.distribution == null
      ? ""
      : `<h3>${esc(STATS_LABELS.gradesDistribution)}</h3>${countBars(
          tests.distribution.map((band) => ({
            label: band.key || "",
            value: band.count,
          })),
          YELLOW
        )}`;
  const list = (tests.parTest || [])
    .map((test) => {
      const date = test.date ? String(test.date).slice(0, 10) : "—";
      return `<p class="line"><strong>${esc(test.titre || STATS_LABELS.testFallback)}</strong><br>${esc(date)} · ${esc(STATS_LABELS.invitedShort)} ${esc(dash(test.invites))} · ${esc(STATS_LABELS.gradedShort)} ${esc(dash(test.notes))} · ${esc(STATS_LABELS.averageShort)} ${esc(dash(test.moyenne))}</p>`;
    })
    .join("");
  return facts + chart + list;
}

function objectifsHtml(objectifs) {
  if (objectifs == null) return unavailable();
  return factsHtml([
    { label: STATS_LABELS.objectifsFixed, value: dash(objectifs.fixes) },
    { label: STATS_LABELS.objectifsAchieved, value: dash(objectifs.atteints) },
    { label: STATS_LABELS.objectifsRate, value: dashPct(objectifs.taux) },
    { label: STATS_LABELS.objectifsAvg, value: dashPct(objectifs.realisationMoyennePct) },
  ]);
}

function seancesHtml(stats) {
  const bySeance = stats?.bySeance;
  if (bySeance == null) return unavailable();
  const chartTitle = `<h3>${esc(STATS_LABELS.seanceHeadcount)}</h3>`;
  const chart = bySeance.length
    ? barsHtml(
        bySeance.map((seance) => ({
          label: seance.name || "",
          value: seance.membersCount,
        })),
        { color: PRIMARY, formatValue: (n) => `${Math.round(n)}${STATS_LABELS.memberSuffix}` }
      )
    : `<p class="muted">${esc(STATS_LABELS.noSeances)}</p>`;
  const lines = bySeance
    .map(
      (seance) =>
        `<p class="line"><strong>${esc(seance.name || "—")}</strong><br>${esc(STATS_LABELS.members)} ${esc(dash(seance.membersCount))} · ${esc(STATS_LABELS.presence)} ${esc(dashPct(seance.presencePct))} · ${esc(STATS_LABELS.gainDuringSeason)} ${esc(formatHizbOne(seance.gainMoyenHizb))} · ${esc(STATS_LABELS.daysCount)} ${esc(dash(seance.sessionCount))}</p>`
    )
    .join("");
  return chartTitle + chart + lines;
}

function supervisorsHtml(stats) {
  const bySupervisor = stats?.bySupervisor;
  if (bySupervisor == null) return unavailable();
  if (!bySupervisor.length) return `<p class="muted">—</p>`;
  return bySupervisor
    .map((sup) => {
      const names = seanceNamesForSupervisor(stats.bySeance, sup.id);
      const name = sup.name || "—";
      if (names.length === 1) {
        return `<p class="line"><strong>${esc(name)} : ${esc(names[0])}</strong></p>`;
      }
      const meta = names.length > 1 ? `${STATS_LABELS.seances}: ${names.join(STATS_LABELS.listSeparator)}` : "—";
      return `<p class="line"><strong>${esc(name)}</strong><br>${esc(meta)}</p>`;
    })
    .join("");
}

function memberTestsCell(row) {
  if (row?.source === "rattrapage") return "—";
  if (row?.testsNotes == null && row?.noteMoyenne == null) return "—";
  return `${dash(row.testsNotes)} · ${dash(row.noteMoyenne)} ${STATS_LABELS.unitScore}`;
}

function memberObjectifCell(row) {
  if (row?.source === "rattrapage" || row?.objectifAtteint == null) return "—";
  return row.objectifAtteint ? STATS_LABELS.achieved : STATS_LABELS.notAchieved;
}

function memberGainCell(row) {
  if (row?.gainTumun == null) return { text: "—", negative: false };
  const n = Number(row.gainTumun) / 8;
  if (!Number.isFinite(n)) return { text: "—", negative: false };
  return { text: formatHizbOne(n), negative: n < 0 };
}

function membersHtml(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return `<p class="muted">${esc(STATS_LABELS.noMemberData)}</p>`;
  const body = list
    .map((row) => {
      const rattrapage = row?.source === "rattrapage";
      const gain = memberGainCell(row);
      const position = `${hizbFromTumun(row?.posDebut)} → ${hizbFromTumun(row?.posFin)}`;
      return `<tr><td class="name">${esc(row?.name || "—")}</td><td>${esc(rattrapage ? "—" : dash(row?.seanceNom))}</td><td>${esc(rattrapage ? "—" : dashPct(row?.presencePct))}</td><td>${esc(position)}</td><td class="${gain.negative ? "neg" : ""}">${esc(gain.text)}</td><td>${esc(memberTestsCell(row))}</td><td>${esc(memberObjectifCell(row))}</td></tr>`;
    })
    .join("");
  return `<table><thead><tr><th class="name">${esc(STATS_LABELS.colName)}</th><th>${esc(STATS_LABELS.seance)}</th><th>${esc(STATS_LABELS.comparePresence)}</th><th>${esc(STATS_LABELS.colPosition)}</th><th>${esc(STATS_LABELS.colGain)}</th><th>${esc(STATS_LABELS.tests)}</th><th>${esc(STATS_LABELS.goal)}</th></tr></thead><tbody>${body}</tbody></table>`;
}

function kpiOf(view) {
  if (!view || view.empty) {
    return { members: null, presence: null, gain: null, tests: null, objectifs: null, seances: null };
  }
  return {
    members: view.effectifs?.membres ?? null,
    presence: view.presence?.pct ?? null,
    gain: view.progression?.gainMoyenHizb ?? null,
    tests: view.tests?.moyenne ?? null,
    objectifs: view.objectifs?.taux ?? null,
    seances: view.seancesTotal ?? null,
  };
}

function seasonDocument(season, stats, memberRows) {
  const current = kpiOf(stats);
  const previous = stats?.previousKpi || null;
  const exportedAt = todayStamp();
  const rattrapage = stats?.rattrapage
    ? `<p class="note">${esc(STATS_LABELS.rattrapageNote)}</p>`
    : "";
  const kpis = [
    kpiCard(STATS_LABELS.members, wholeNumber(current.members), "", deltaHtml(current.members, previous?.members)),
    kpiCard(STATS_LABELS.presenceRate, wholeNumber(current.presence), STATS_LABELS.unitPercent, deltaHtml(current.presence, previous?.presence)),
    kpiCard(
      STATS_LABELS.gainSeasonAvg,
      oneDecimal(current.gain),
      STATS_LABELS.unitHizb,
      deltaHtml(current.gain, previous?.gain)
    ),
    kpiCard(STATS_LABELS.testsAverage, oneDecimal(current.tests), STATS_LABELS.unitScore, deltaHtml(current.tests, previous?.tests)),
    kpiCard(STATS_LABELS.objectifsRate, wholeNumber(current.objectifs), STATS_LABELS.unitPercent, deltaHtml(current.objectifs, previous?.objectifs)),
    kpiCard(STATS_LABELS.seances, wholeNumber(current.seances), "", deltaHtml(current.seances, previous?.seances)),
  ].join("");
  const seancesCount = dash(stats?.seancesTotal ?? stats?.bySeance?.length);
  const supervisorsCount = dash(stats?.supervisorsTotal ?? stats?.bySupervisor?.length);
  const seasonName = season?.name || stats?.name || STATS_LABELS.seasonFallback;
  const body = `
    <header class="head">
      <p class="app">${esc(STATS_LABELS.appName)}</p>
      <h1>${esc(STATS_LABELS.seasonReportTitle)}</h1>
      <p>${esc(seasonName)}</p>
      <p>${esc(seasonTypeLabel(season?.type || stats?.type))} · ${esc(season?.active || stats?.active ? STATS_LABELS.active : STATS_LABELS.closed)}</p>
      <p>${esc(STATS_LABELS.from)} ${esc(formatDate(season?.startDate || stats?.startDate))} ${esc(STATS_LABELS.to)} ${esc(formatDate(season?.endDate))}</p>
      <p class="muted">${esc(STATS_LABELS.exportDate)} ${esc(exportedAt)}</p>
      ${rattrapage}
    </header>
    <div class="kpis">${kpis}</div>
    ${section(STATS_LABELS.members, effectifsHtml(stats?.effectifs))}
    ${section(STATS_LABELS.presence, presenceHtml(stats?.presence))}
    ${section(STATS_LABELS.progress, progressionHtml(stats))}
    ${section(STATS_LABELS.tests, testsHtml(stats?.tests))}
    ${section(STATS_LABELS.objectifs, objectifsHtml(stats?.objectifs))}
    ${section(`${STATS_LABELS.seances}: ${seancesCount}`, seancesHtml(stats))}
    ${section(`${STATS_LABELS.supervisors}: ${supervisorsCount}`, supervisorsHtml(stats))}
    <section class="block members"><h2>${esc(STATS_LABELS.memberList)}</h2>${membersHtml(memberRows)}</section>
  `;
  return pageHtml(body, seasonName);
}

function compareCell(value, indicator) {
  if (value == null || value === "") return { text: "—", negative: false };
  if (indicator.key !== "gain") return { text: `${value}${indicator.suffix}`, negative: false };
  const n = Number(value);
  if (!Number.isFinite(n)) return { text: "—", negative: false };
  const text = `${n.toFixed(1)} ${STATS_LABELS.unitHizb}`;
  return { text: n < 0 ? `\u200E${text}` : text, negative: n < 0 };
}

function seasonYear(startDate) {
  const year = String(startDate || "").slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
}

function compareSeasonLabel(view) {
  const year = seasonYear(view?.startDate);
  const name = view?.name || STATS_LABELS.seasonFallback;
  const base = year ? `${name} · ${year}` : name;
  return view?.active ? `${base} ${STATS_LABELS.activeMark}` : base;
}

function comparisonDocument(type, seasons) {
  const ordered = [...(seasons || [])].sort((a, b) =>
    String(a.startDate || a.snapshotAt || "").localeCompare(String(b.startDate || b.snapshotAt || ""))
  );
  const exportedAt = todayStamp();
  const header = `
    <header class="head">
      <h1>${esc(STATS_LABELS.compareTitle)}</h1>
      <p>${esc(compareTypeLabel(type))}</p>
      <p>${esc(STATS_LABELS.seasonCount)} ${esc(ordered.length)}</p>
      <p class="muted">${esc(STATS_LABELS.exportDate)} ${esc(exportedAt)}</p>
    </header>
  `;
  const head = COMPARE_INDICATORS.map((indicator) => `<th>${esc(indicator.label)}</th>`).join("");
  const rows = ordered
    .map((view) => {
      const kpi = kpiOf(view);
      const cells = COMPARE_INDICATORS.map((indicator) => {
        const cell = compareCell(kpi[indicator.key], indicator);
        return `<td class="${cell.negative ? "neg" : ""}">${esc(cell.text)}</td>`;
      }).join("");
      return `<tr><td class="name">${esc(compareSeasonLabel(view))}</td>${cells}</tr>`;
    })
    .join("");
  const table = `<table><thead><tr><th class="name">${esc(STATS_LABELS.seasonColumn)}</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  if (ordered.length < 2) {
    return pageHtml(
      `${header}${table}<p class="muted">${esc(STATS_LABELS.compareNotEnough)}</p>`,
      STATS_LABELS.compareTitle
    );
  }
  const charts = COMPARE_INDICATORS.map((indicator) => {
    const items = ordered.map((view) => ({
      label: view.name || STATS_LABELS.seasonFallback,
      caption: seasonYear(view.startDate),
      value: kpiOf(view)[indicator.key],
    }));
    const formatValue =
      indicator.key === "gain"
        ? (n) => {
            const text = `${n.toFixed(1)} ${STATS_LABELS.unitHizb}`;
            return n < 0 ? `\u200E${text}` : text;
          }
        : (n) => `${n}${indicator.suffix}`;
    return section(indicator.label, barsHtml(items, { color: PRIMARY, formatValue }));
  }).join("");
  return pageHtml(`${header}${table}${charts}`, STATS_LABELS.compareTitle);
}

function pageHtml(body, footerName) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0 0 22px; font-family: Tahoma, Arial, sans-serif; color: #333; font-size: 12px; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  h2 { font-size: 15px; margin: 0 0 8px; }
  h3 { font-size: 13px; margin: 12px 0 6px; }
  p { margin: 0 0 4px; }
  .app { font-weight: 800; color: ${PRIMARY}; }
  .muted, .note { color: ${MUTED}; }
  .head { margin-bottom: 12px; }
  .block { margin: 0 0 14px; }
  .block:not(.members) { page-break-inside: avoid; break-inside: avoid; }
  .members { page-break-before: always; break-before: page; }
  .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .kpi { width: calc(33.33% - 6px); border: 1px solid ${BORDER}; border-radius: 8px; padding: 8px; page-break-inside: avoid; break-inside: avoid; }
  .kpi-value { font-size: 18px; font-weight: 700; }
  .unit { font-size: 12px; color: ${MUTED}; margin-right: 4px; }
  .kpi-label { font-size: 11px; color: ${MUTED}; margin-top: 4px; }
  .delta { font-size: 11px; font-weight: 700; }
  .delta.up { color: ${PRIMARY}; }
  .delta.down { color: ${RED}; }
  .delta.eq { color: ${MUTED}; }
  .facts { margin-bottom: 6px; }
  .fact { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px solid #f2f2f2; }
  .bars { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; margin: 8px 0; }
  .bar-col { flex: 1 1 48px; max-width: 88px; text-align: center; }
  .bar-value { font-size: 10px; font-weight: 700; min-height: 14px; }
  .track { height: 90px; background: ${TRACK}; border-radius: 4px; display: flex; align-items: flex-end; overflow: hidden; }
  .fill { width: 100%; }
  .bar-label, .bar-caption { font-size: 9px; margin-top: 3px; word-wrap: break-word; }
  .bar-caption { color: ${MUTED}; }
  .neg { color: ${RED}; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead { display: table-header-group; }
  th, td { border-bottom: 1px solid ${BORDER}; padding: 6px 4px; text-align: center; font-size: 10px; vertical-align: middle; }
  th { background: ${SOFT}; font-weight: 800; }
  th.name, td.name { text-align: right; background: ${SOFT}; border-left: 1px solid ${BORDER}; width: 22%; }
  tr, .line { page-break-inside: avoid; break-inside: avoid; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 10px; color: ${MUTED}; display: flex; justify-content: space-between; }
  .footer-page::after { content: counter(page); }
</style>
</head>
<body>
${body}
<div class="footer"><span>${esc(footerName || "")}</span><span class="footer-page"></span></div>
</body>
</html>`;
}

function isShareCancel(error) {
  const msg = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return /cancel|cancell|dismiss|abort|user did not share/.test(msg);
}

function isMissingNativeModule(error) {
  return /Cannot find native module/i.test(`${error?.message || ""} ${error?.code || ""}`);
}

function loadPrintModules() {
  const Print = require("expo-print");
  const Sharing = require("expo-sharing");
  return { Print, Sharing };
}

async function renderPdf(html) {
  let Print;
  let Sharing;
  try {
    ({ Print, Sharing } = loadPrintModules());
  } catch (error) {
    if (isMissingNativeModule(error)) return { ok: false, code: "native_missing" };
    return { ok: false, code: "error" };
  }
  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, code: "sharing_unavailable" };
    }
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    // expo-file-system n'est pas installé : le fichier garde le nom de cache
    // de printToFileAsync. stats_<id>_<date>.pdf n'est pas appliqué.
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: STATS_LABELS.exportDialog,
    });
    return { ok: true, renamed: false };
  } catch (error) {
    if (isShareCancel(error)) return { ok: false, cancelled: true };
    if (isMissingNativeModule(error)) return { ok: false, code: "native_missing" };
    return { ok: false, code: "error" };
  }
}

export function alertForExportResult(result) {
  if (!result || result.ok || result.cancelled) return;
  if (result.code === "native_missing") {
    Alert.alert("التصدير يتطلب تحديث التطبيق إلى آخر إصدار");
    return;
  }
  Alert.alert(
    result.code === "sharing_unavailable"
      ? STATS_LABELS.sharingUnavailable
      : STATS_LABELS.exportFailed
  );
}

export async function exportSeasonPdf(season, stats, memberRows) {
  const html = seasonDocument(season, stats, memberRows);
  return renderPdf(html);
}

export async function exportComparisonPdf(type, seasons) {
  const html = comparisonDocument(type, seasons);
  return renderPdf(html);
}
