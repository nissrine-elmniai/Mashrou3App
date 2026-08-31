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

function isValidJourSemaine(jour) {
  return JOUR_SEMAINE_VALUES.includes(jour);
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
export async function getAllSeances() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("seances")
        .select(
          "*, superviseur:profiles!seances_superviseur_id_fkey(first_name, last_name, email), inscriptions:inscriptions!inscriptions_seance_id_fkey(id, statut)"
        )
        .order("created_at", { ascending: false }),
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
 * (Admin) Création d'une séance.
 * @param {object} payload { nom, saisonId?, jour?, heureDebut?, heureFin?, superviseurId? }
 * @returns { ok, seance? }
 */
export async function createSeance({
  nom,
  saisonId = null,
  jour = null,
  heureDebut = null,
  heureFin = null,
  superviseurId = null,
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

  const row = {
    nom: cleanNom,
    saison_id: saisonId || null,
    jour: jour || null,
    heure_debut: heureDebut || null,
    heure_fin: heureFin || null,
    superviseur_id: superviseurId || null,
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
        return { ok: false, error: mapTableError(archiveError, "seance_planning_history") };
      }

      updatePayload.planning_valide_depuis = now;
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
export async function getAllAcceptedInscriptions() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("inscriptions")
        .select("id, membre_id, seance_id, seance:seances!inscriptions_seance_id_fkey(id, nom)")
        .eq("statut", "accepte"),
      SUPABASE_TIMEOUT_MS,
      "قراءة التسجيلات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "inscriptions") };
    }
    return { ok: true, inscriptions: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
