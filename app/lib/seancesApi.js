import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

const SUPABASE_TIMEOUT_MS = 15000;

/** Valeurs enum Postgres jour_semaine (semaine commençant le samedi). */
export const JOUR_SEMAINE_VALUES = [
  "السبت",
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
];

/** Libellé affiché pour une séance (jour — heure début–fin). */
export function formatSeanceScheduleLabel(seance) {
  if (!seance) return "";
  const jour = seance.jour || "";
  const start = seance.heure_debut ? String(seance.heure_debut).slice(0, 5) : "";
  const end = seance.heure_fin ? String(seance.heure_fin).slice(0, 5) : "";
  const heures =
    start && end ? `${start} – ${end}` : start || end || "";
  if (jour && heures) return `${jour} — ${heures}`;
  return jour || heures || seance.nom || "";
}

const JOUR_SEMAINE_INDEX = Object.fromEntries(
  JOUR_SEMAINE_VALUES.map((jour, index) => [jour, index])
);

/** Compare deux jours enum pour tri logique (السبت → الجمعة), pas alphabétique. */
export function compareJourSemaine(a, b) {
  const ia = JOUR_SEMAINE_INDEX[a] ?? 99;
  const ib = JOUR_SEMAINE_INDEX[b] ?? 99;
  return ia - ib;
}

/** Tri stable par jour de semaine puis par nom de séance. */
export function sortSeancesByJour(seances = []) {
  return [...seances].sort((a, b) => {
    const byJour = compareJourSemaine(a?.jour, b?.jour);
    if (byJour !== 0) return byJour;
    return String(a?.nom || "").localeCompare(String(b?.nom || ""), "ar");
  });
}

function isValidGenre(genre) {
  return genre === "ذكر" || genre === "أنثى";
}

function isValidJourSemaine(jour) {
  return JOUR_SEMAINE_VALUES.includes(jour);
}

/** Normalise une heure saisie (HH:MM) vers le format Postgres time. */
export function normalizePgTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** Affiche une heure Postgres (HH:MM:SS) en HH:MM. */
export function formatPgTimeLabel(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

/**
 * (Public) Séances actives filtrées par sexe — formulaire d'intégration.
 * RLS : seances_select_active_public.
 * @param {string} genre 'ذكر' | 'أنثى'
 * @returns {{ ok, seances }}
 */
export async function getActiveSeancesByGenre(genre, saisonId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!isValidGenre(genre)) {
    return { ok: true, seances: [] };
  }
  try {
    let query = supabase
      .from("seances")
      .select("id, nom, jour, heure_debut, heure_fin, genre, statut, saison_id")
      .eq("statut", "active")
      .eq("genre", genre);
    if (saisonId) {
      query = query.or(`saison_id.eq.${saisonId},saison_id.is.null`);
    }
    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "قراءة الحصص المتاحة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "seances") };
    }
    return { ok: true, seances: sortSeancesByJour(data || []) };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}


/** UUID v4 de profile — toute autre valeur (ex. "admin") est refusée. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Traduit une erreur de table Supabase (table absente / RLS / doublon / autre). */
function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/duplicate key|23505/i.test(msg)) {
    return "سجل مكرر — هذه العملية مسجلة مسبقاً";
  }
  return mapSupabaseAuthError(error);
}

/** Id du membre connecté via la session Supabase, ou null. */
async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/**
 * (Admin) Toutes les séances, avec le profil du superviseur et les
 * inscriptions jointes (comptage des membres 'accepte' côté client).
 * RLS : seances_admin_all / inscriptions_admin_all / profiles_select_admin.
 * @returns { ok, seances }
 */
export async function getAllSeances({ saisonId = null } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    let query = supabase
      .from("seances")
      .select(
        "*, superviseur:profiles!seances_superviseur_id_fkey(first_name, last_name, email), inscriptions:inscriptions!inscriptions_seance_id_fkey(id, statut)"
      );
    if (saisonId) {
      query = query.or(`saison_id.eq.${saisonId},saison_id.is.null`);
    }
    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "قراءة الحصص"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "seances") };
    }
    return { ok: true, seances: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Recherche une séance active par nom (comparaison insensible à la casse).
 * @returns {{ ok, seance? }}
 */
export async function findActiveSeanceByName(nom, saisonId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const cleanNom = String(nom || "").trim();
  if (!cleanNom) {
    return { ok: true, seance: null };
  }
  try {
    let query = supabase
      .from("seances")
      .select("id, nom, statut, superviseur_id, saison_id")
      .eq("statut", "active");
    if (saisonId) {
      query = query.eq("saison_id", saisonId);
    }
    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "البحث عن الحصة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "seances") };
    }
    const seance =
      (data || []).find(
        (row) =>
          row.nom && row.nom.trim().toLowerCase() === cleanNom.toLowerCase()
      ) || null;
    return { ok: true, seance };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Création d'une séance.
 * @param {object} payload { nom, saisonId?, jour?, heureDebut?, heureFin?, superviseurId?, genre?, dateDebut?, dateFin? }
 * @returns { ok, seance? }
 */
export async function createSeance({
  nom,
  saisonId = null,
  jour = null,
  heureDebut = null,
  heureFin = null,
  superviseurId = null,
  genre = null,
  dateDebut = null,
  dateFin = null,
}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const authId = await currentAuthId();
  if (!authId) {
    return {
      ok: false,
      error: "لا توجد جلسة Supabase. سجّل الخروج ثم سجّل الدخول مجدداً بحساب الأدمن.",
    };
  }
  const cleanNom = String(nom || "").trim();
  if (!cleanNom) {
    return { ok: false, error: "أدخل اسم الحصة" };
  }
  if (superviseurId && !UUID_RE.test(superviseurId)) {
    return { ok: false, error: "المشرف المحدد غير صالح" };
  }
  if (jour && !isValidJourSemaine(jour)) {
    return { ok: false, error: "يوم الحصة غير صالح" };
  }
  if (!genre || !isValidGenre(genre)) {
    return { ok: false, error: "اختر جنس الحصة (ذكر أو أنثى)" };
  }

  const startTime = normalizePgTime(heureDebut);
  const endTime = normalizePgTime(heureFin);
  if (!startTime) {
    return { ok: false, error: "أدخل ساعة بداية الحصة" };
  }
  if (!endTime) {
    return { ok: false, error: "أدخل ساعة نهاية الحصة" };
  }
  if (endTime <= startTime) {
    return { ok: false, error: "ساعة النهاية يجب أن تكون بعد ساعة البداية" };
  }

  const start = normalizePgDate(dateDebut);
  const end = normalizePgDate(dateFin);
  if (start && end && end < start) {
    return { ok: false, error: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" };
  }

  const row = {
    nom: cleanNom,
    saison_id: saisonId || null,
    jour: jour || null,
    heure_debut: startTime,
    heure_fin: endTime,
    superviseur_id: superviseurId || null,
    genre,
    date_debut: start,
    date_fin: end,
    statut: "active",
  };

  try {
    const { data, error } = await withTimeout(
      supabase.from("seances").insert(row).select("*").single(),
      SUPABASE_TIMEOUT_MS,
      "إنشاء الحصة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "seances") };
    }
    return { ok: true, seance: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Normalise une date (YYYY-MM-DD ou YYYY/MM/DD) pour Postgres date. */
function normalizePgDate(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim().replace(/\//g, "-");
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  const y = match[1];
  const m = String(match[2]).padStart(2, "0");
  const d = String(match[3]).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeTimeValue(value) {
  if (value == null || value === "") return null;
  return String(value).slice(0, 5);
}

function planningFieldChanged(current, patch, field) {
  if (patch[field] === undefined) return false;
  if (field === "heure_debut" || field === "heure_fin") {
    return normalizeTimeValue(current?.[field]) !== normalizeTimeValue(patch[field]);
  }
  return (current?.[field] ?? null) !== (patch[field] ?? null);
}

function hasPlanningChange(current, patch) {
  return (
    planningFieldChanged(current, patch, "jour") ||
    planningFieldChanged(current, patch, "heure_debut") ||
    planningFieldChanged(current, patch, "heure_fin")
  );
}

/**
 * (Admin) Mise à jour d'une séance.
 * Si jour/heure_debut/heure_fin changent : archive l'ancienne période dans
 * seance_planning_history avant d'écraser, puis planning_valide_depuis = now().
 * @param {object} payload { seanceId, patch: { nom?, saison_id?, jour?, heure_debut?, heure_fin?, superviseur_id?, statut? } }
 * @returns { ok, seance? }
 */
export async function updateSeance({ seanceId, patch }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }
  const clean = { ...patch };
  if (clean.nom !== undefined) {
    clean.nom = String(clean.nom).trim();
    if (!clean.nom) {
      return { ok: false, error: "اسم الحصة مطلوب" };
    }
  }
  if (clean.superviseur_id !== undefined && clean.superviseur_id !== null) {
    if (!UUID_RE.test(clean.superviseur_id)) {
      return { ok: false, error: "المشرف المحدد غير صالح" };
    }
  }
  if (clean.jour !== undefined && clean.jour !== null && !isValidJourSemaine(clean.jour)) {
    return { ok: false, error: "يوم الحصة غير صالح" };
  }
  if (clean.genre !== undefined && clean.genre !== null && !isValidGenre(clean.genre)) {
    return { ok: false, error: "جنس الحصة غير صالح" };
  }
  if (clean.heure_debut !== undefined && clean.heure_debut !== null && clean.heure_debut !== "") {
    const normalized = normalizePgTime(clean.heure_debut);
    if (!normalized) {
      return { ok: false, error: "ساعة البداية غير صالحة" };
    }
    clean.heure_debut = normalized;
  }
  if (clean.heure_fin !== undefined && clean.heure_fin !== null && clean.heure_fin !== "") {
    const normalized = normalizePgTime(clean.heure_fin);
    if (!normalized) {
      return { ok: false, error: "ساعة النهاية غير صالحة" };
    }
    clean.heure_fin = normalized;
  }
  if (
    clean.heure_debut &&
    clean.heure_fin &&
    clean.heure_fin <= clean.heure_debut
  ) {
    return { ok: false, error: "ساعة النهاية يجب أن تكون بعد ساعة البداية" };
  }
  if (clean.date_debut !== undefined) {
    if (clean.date_debut === null || clean.date_debut === "") {
      clean.date_debut = null;
    } else {
      const normalized = normalizePgDate(clean.date_debut);
      if (!normalized) {
        return { ok: false, error: "تاريخ البداية غير صالح" };
      }
      clean.date_debut = normalized;
    }
  }
  if (clean.date_fin !== undefined) {
    if (clean.date_fin === null || clean.date_fin === "") {
      clean.date_fin = null;
    } else {
      const normalized = normalizePgDate(clean.date_fin);
      if (!normalized) {
        return { ok: false, error: "تاريخ النهاية غير صالح" };
      }
      clean.date_fin = normalized;
    }
  }
  if (
    clean.date_debut &&
    clean.date_fin &&
    clean.date_fin < clean.date_debut
  ) {
    return { ok: false, error: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" };
  }

  try {
    const { data: current, error: fetchError } = await withTimeout(
      supabase
        .from("seances")
        .select("jour, heure_debut, heure_fin, planning_valide_depuis, created_at")
        .eq("id", seanceId)
        .single(),
      SUPABASE_TIMEOUT_MS,
      "قراءة الحصة"
    );

    if (fetchError) {
      return { ok: false, error: mapTableError(fetchError, "seances") };
    }
    if (!current) {
      return { ok: false, error: "الحصة غير موجودة" };
    }

    const now = new Date().toISOString();
    const updatePayload = { ...clean, updated_at: now };

    if (hasPlanningChange(current, clean)) {
      const archiveRow = {
        seance_id: seanceId,
        jour: current.jour ?? null,
        heure_debut: current.heure_debut ?? null,
        heure_fin: current.heure_fin ?? null,
        valide_depuis: current.planning_valide_depuis || current.created_at || now,
        valide_jusqu_a: now,
      };

      const { error: archiveError } = await withTimeout(
        supabase.from("seance_planning_history").insert(archiveRow),
        SUPABASE_TIMEOUT_MS,
        "أرشفة جدول الحصة"
      );

      if (archiveError) {
        // Ne bloque pas la mise à jour de la séance : table absente / grants
        // manquants / RLS — le planning est quand même mis à jour.
        console.warn(
          "[seancesApi] archive planning history échouée — mise à jour sans historique:",
          archiveError.message || archiveError
        );
      } else {
        updatePayload.planning_valide_depuis = now;
      }
    }

    const { data, error } = await withTimeout(
      supabase
        .from("seances")
        .update(updatePayload)
        .eq("id", seanceId)
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "تحديث الحصة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "seances") };
    }
    // .single() échoue si 0 lignes (RLS a filtré l'update)
    if (!data) {
      return {
        ok: false,
        error: "لا صلاحية كافية لهذه العملية — تحقق أن حسابك أدمن",
      };
    }
    return { ok: true, seance: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Archivage d'une séance : statut -> 'archivee' (pas de suppression
 * dure : l'historique des inscriptions/tests/progression est conservé).
 * @param {string} seanceId
 * @returns { ok, seance? }
 */
export async function archiveSeance(seanceId) {
  return updateSeance({ seanceId, patch: { statut: "archivee" } });
}

/** (Admin) Archive toutes les séances actives des musims donnés (fin de musim). */
export async function archiveSeancesForSaisonIds(saisonIds = []) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }
  const ids = [...new Set((saisonIds || []).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true };
  }
  try {
    const { error } = await withTimeout(
      supabase
        .from("seances")
        .update({ statut: "archivee", updated_at: new Date().toISOString() })
        .in("saison_id", ids)
        .eq("statut", "active"),
      SUPABASE_TIMEOUT_MS,
      "أرشفة حصص الموسم السابق"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "seances") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Membres 'accepte' d'une séance, avec leur profil joint.
 * @param {string} seanceId
 * @returns { ok, members }
 */
export async function getSeanceMembers(seanceId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("inscriptions")
        .select("*, membre:profiles!inscriptions_membre_id_fkey(id, first_name, last_name, email)")
        .eq("seance_id", seanceId)
        .eq("statut", "accepte"),
      SUPABASE_TIMEOUT_MS,
      "قراءة أعضاء الحصة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "inscriptions") };
    }
    return { ok: true, members: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Profils des superviseurs (gestion, sélection dans les séances,
 * chat admin). RLS : profiles_select_admin.
 * @returns { ok, supervisors }
 */
export async function getSupervisorProfiles() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email, account_status")
        .eq("role", "supervisor")
        .order("created_at", { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      "قراءة المشرفين"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "profiles") };
    }
    return { ok: true, supervisors: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Profils des membres (exclut les comptes 'invited' sans compte).
 * RLS : profiles_select_admin.
 * @returns { ok, members }
 */
export async function getMemberProfiles() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email, account_status, created_at")
        .eq("role", "member")
        .order("created_at", { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      "قراءة الأعضاء"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "profiles") };
    }
    return { ok: true, members: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Toutes les inscriptions 'accepte' avec la séance jointe
 * (affectation membre <-> séance pour l'écran Membres).
 * @returns { ok, inscriptions }
 */
export async function getAllAcceptedInscriptions({ saisonId = null } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("inscriptions")
        .select(
          "id, membre_id, seance_id, saison_id, date_inscription, seance:seances!inscriptions_seance_id_fkey(id, nom, saison_id, jour, heure_debut, heure_fin)"
        )
        .eq("statut", "accepte"),
      SUPABASE_TIMEOUT_MS,
      "قراءة التسجيلات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "inscriptions") };
    }
    let rows = data || [];
    if (saisonId) {
      rows = rows.filter(
        (row) =>
          row.saison_id === saisonId || row.seance?.saison_id === saisonId
      );
    }
    return { ok: true, inscriptions: rows };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
