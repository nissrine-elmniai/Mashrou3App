import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { filterSeancesForSeason, supervisorIdsForSeason } from "./seasonScope";
import { canonicalEmail, isSupervisorAuthEmail } from "./authEmail";

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

/** Normalise le genre sans importer membersApi (évite import circulaire). */
function normalizeGenre(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const key = text.toLowerCase();
  if (key === "m" || key === "male" || key === "homme" || text === "ذكر") {
    return "ذكر";
  }
  if (
    key === "f" ||
    key === "female" ||
    key === "femme" ||
    text === "أنثى" ||
    text === "انثى"
  ) {
    return "أنثى";
  }
  return text;
}

function isValidGenre(genre) {
  const normalized = normalizeGenre(genre);
  return normalized === "ذكر" || normalized === "أنثى";
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
 * (Public) Séances actives filtrées par sexe — formulaire d'intégration / renouvellement.
 * RLS : seances_select_active_public.
 * @param {string} genre 'ذكر' | 'أنثى' (ou variante normalisée)
 * @param {string|null} saisonId musim actif — exclut les séances d'autres musims
 * @returns {{ ok, seances, reason?: string }}
 */
export async function getActiveSeancesByGenre(genre, saisonId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", seances: [] };
  }
  const normalized = normalizeGenre(genre);
  if (!isValidGenre(normalized)) {
    return { ok: true, seances: [], reason: "invalid_genre" };
  }
  try {
    // Pas de filtre genre strict SQL (variantes unicode / legacy) — filtrage client
    let query = supabase
      .from("seances")
      .select("id, nom, jour, heure_debut, heure_fin, genre, statut, saison_id")
      .eq("statut", "active");
    if (saisonId) {
      query = query.eq("saison_id", saisonId);
    }
    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "قراءة الحصص المتاحة"
    );
    if (error) {
      return {
        ok: false,
        error: mapTableError(error, "seances"),
        seances: [],
      };
    }

    const allActive = data || [];
    const forGenre = allActive.filter(
      (s) => normalizeGenre(s.genre) === normalized
    );

    // Diagnostic : des séances du genre existent mais hors musim (archivées / autre saison)
    if (forGenre.length === 0 && saisonId) {
      const { data: anySeason } = await withTimeout(
        supabase
          .from("seances")
          .select("id, genre, statut, saison_id")
          .eq("statut", "active"),
        SUPABASE_TIMEOUT_MS,
        "قراءة الحصص"
      );
      const elsewhere = (anySeason || []).filter(
        (s) => normalizeGenre(s.genre) === normalized
      );
      if (elsewhere.length > 0) {
        return {
          ok: true,
          seances: [],
          reason: "wrong_season",
        };
      }
    }

    return {
      ok: true,
      seances: sortSeancesByJour(forGenre),
      reason: forGenre.length === 0 ? "none" : null,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      seances: [],
    };
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
 * (Admin) Toutes les séances.
 * Par défaut : profil superviseur + inscriptions (comptage membres).
 * `lite` : id, nom, statut, superviseur_id, saison_id — liste des superviseurs.
 * RLS : seances_admin_all / inscriptions_admin_all / profiles_select_admin.
 * @returns { ok, seances }
 */
const SEANCES_SELECT_FULL =
  "*, superviseur:profiles!seances_superviseur_id_fkey(first_name, last_name, email, canonical_email), inscriptions:inscriptions!inscriptions_seance_id_fkey(id, statut)";
const SEANCES_SELECT_LITE = "id, nom, statut, superviseur_id, saison_id";

export async function getAllSeances({ saisonId = null, lite = false } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    let query = supabase
      .from("seances")
      .select(lite ? SEANCES_SELECT_LITE : SEANCES_SELECT_FULL);
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
      const msg = error?.message || "";
      if (
        /23505|duplicate key/i.test(msg) &&
        /seances_saison_id_superviseur_id_key|seances_saison_superviseur_actif_key|superviseur_id/i.test(msg)
      ) {
        return { ok: false, error: "هذا المشرف مكلف بحصة أخرى" };
      }
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

/**
 * (Admin) Mise à jour d'une séance.
 * Historique des horaires écrit côté serveur par le trigger
 * seances_record_planning_history (0117) — ne pas le réécrire ici.
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
  let requestedSuperviseurId;
  if (clean.superviseur_id !== undefined) {
    if (clean.superviseur_id !== null && !UUID_RE.test(clean.superviseur_id)) {
      return { ok: false, error: "المشرف المحدد غير صالح" };
    }
    requestedSuperviseurId = clean.superviseur_id;
    delete clean.superviseur_id;
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
    const now = new Date().toISOString();
    // Historique des horaires écrit côté serveur par le trigger
    // seances_record_planning_history (0117) — ne pas le réécrire ici.
    const updatePayload = { ...clean, updated_at: now };

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
    if (requestedSuperviseurId) {
      const assigned = await assignOrSwapSeanceSuperviseur(
        seanceId,
        requestedSuperviseurId
      );
      if (!assigned.ok) {
        return { ok: false, error: assigned.error };
      }
      return { ok: true, seance: data, assignment: assigned.result };
    }
    return { ok: true, seance: data, assignment: null };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

function mapAssignSuperviseurError(error) {
  const msg = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(" ");
  if (/SEANCE_ARCHIVEE/.test(msg)) {
    return "لا يمكن تغيير مشرف حصة مؤرشفة. نفّذ الهجرة 0090 إذا كان المشرف حراً بعد أرشفة حصته.";
  }
  if (/SEANCE_INTROUVABLE/.test(msg)) {
    return "الحصة غير موجودة";
  }
  if (/PARAMETRE_MANQUANT/.test(msg)) {
    return "بيانات الحصة أو المشرف غير مكتملة";
  }
  if (/23503|foreign key/i.test(msg)) {
    return "المشرف المحدد غير موجود";
  }
  if (/ADMIN_REQUIS|42501|permission|row-level security/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/not deferrable|seances_saison_superviseur_actif_key/i.test(msg)) {
    return "تعذر تبديل المشرفين. نفّذ الهجرة 0090 في SQL Editor.";
  }
  if (/duplicate key|23505/i.test(msg)) {
    return "تعذر حفظ المشرف: هذا المشرف مكلف بحصة أخرى في نفس الموسم.";
  }
  return mapSupabaseAuthError(error);
}

/**
 * (Admin) Séance de la même saison déjà tenue par ce superviseur.
 * Les autres saisons sont ignorées : elles ne sont ni bloquantes ni modifiées.
 * @returns {{ ok: boolean, error?: string, conflict: null|'swap', seance: {id, nom, saison_id, statut}|null }}
 */
export async function findOccupiedSeanceForSuperviseur(
  superviseurId,
  { excludeSeanceId = null, saisonId = null } = {}
) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", conflict: null, seance: null };
  }
  if (!superviseurId || !UUID_RE.test(superviseurId)) {
    return { ok: false, error: "المشرف المحدد غير صالح", conflict: null, seance: null };
  }
  try {
    let query = supabase
      .from("seances")
      .select("id, nom, saison_id, statut")
      .eq("superviseur_id", superviseurId);
    if (excludeSeanceId) {
      query = query.neq("id", excludeSeanceId);
    }
    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "التحقق من المشرف"
    );
    if (error) {
      return {
        ok: false,
        error: mapTableError(error, "seances"),
        conflict: null,
        seance: null,
      };
    }
    const rows = (data || []).filter((row) =>
      saisonId ? row.saison_id === saisonId : true
    );
    const sameSeason =
      rows.find((row) => row.statut !== "archivee") || null;
    if (sameSeason) {
      return { ok: true, conflict: "swap", seance: sameSeason };
    }
    return { ok: true, conflict: null, seance: null };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      conflict: null,
      seance: null,
    };
  }
}

/**
 * Séances dont ce profil est (ou a été) le responsable.
 * Sert à distinguer un compte sans historique (suppression physique)
 * d'un compte encore cité par une séance archivée (désactivation).
 * @returns {{ ok: boolean, error?: string, seances: Array }}
 */
export async function listSupervisorSeances(superviseurId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", seances: [] };
  }
  if (!superviseurId) {
    return { ok: false, error: "معرّف المشرف مفقود", seances: [] };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("seances")
        .select("id, nom, statut, saison_id, superviseur_id")
        .eq("superviseur_id", superviseurId),
      SUPABASE_TIMEOUT_MS,
      "قراءة حصص المشرف"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "seances"), seances: [] };
    }
    return { ok: true, seances: data || [] };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      seances: [],
    };
  }
}

/**
 * (Admin) Affecte le superviseur, ou le permute avec l'autre séance
 * de la même saison. RPC assign_or_swap_seance_superviseur.
 * @returns {{ ok: boolean, error?: string, result?: { action: 'none'|'assign'|'swap', other_seance_id: string|null, other_seance_nom: string|null } }}
 */
export async function assignOrSwapSeanceSuperviseur(seanceId, superviseurId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }
  if (!superviseurId || !UUID_RE.test(superviseurId)) {
    return { ok: false, error: "المشرف المحدد غير صالح" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase.rpc("assign_or_swap_seance_superviseur", {
        p_seance_id: seanceId,
        p_superviseur_id: superviseurId,
      }),
      SUPABASE_TIMEOUT_MS,
      "تبديل المشرف"
    );
    if (error) {
      return { ok: false, error: mapAssignSuperviseurError(error) };
    }
    return { ok: true, result: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Suppression d'une séance.
 * Le trigger 0120 refuse (P0001) s'il reste une inscription acceptée.
 * @returns {{ ok: boolean, error?: string }}
 */
export async function deleteSeance(seanceId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }
  try {
    const { error } = await withTimeout(
      supabase.from("seances").delete().eq("id", seanceId),
      SUPABASE_TIMEOUT_MS,
      "حذف الحصة"
    );
    if (error) {
      if (String(error.code || "") === "P0001") {
        return {
          ok: false,
          error:
            error.message ||
            "لا يمكن حذف حصة بها أعضاء — انقل الأعضاء إلى حصة أخرى أولاً",
        };
      }
      return { ok: false, error: mapTableError(error, "seances") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

function supervisorCanonicalKey(profile) {
  return canonicalEmail(profile?.canonical_email || profile?.email);
}

function isShadowSupervisorAccount(profile) {
  if (isSupervisorAuthEmail(profile?.email)) return true;
  const stored = canonicalEmail(profile?.email);
  const declared = canonicalEmail(profile?.canonical_email);
  return Boolean(stored && declared && stored !== declared);
}

/**
 * Un seul profil par e-mail canonique.
 * Le compte `+supervisor` (أميمة العماري) partage l'e-mail d'Oumeyma :
 * on garde le profil qui tient une séance active, sinon celui sans suffixe.
 * @param {Array} supervisors
 * @param {Set<string>|null} activeIds ids affectés à une séance active de la saison
 */
export function excludeDuplicateSupervisorAccounts(supervisors = [], activeIds = null) {
  const groups = new Map();
  for (const profile of supervisors || []) {
    const key = supervisorCanonicalKey(profile) || profile?.id;
    if (!key) continue;
    const bucket = groups.get(key) || [];
    bucket.push(profile);
    groups.set(key, bucket);
  }
  const kept = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      kept.push(bucket[0]);
      continue;
    }
    const ranked = [...bucket].sort((a, b) => {
      const aShadow = isShadowSupervisorAccount(a) ? 1 : 0;
      const bShadow = isShadowSupervisorAccount(b) ? 1 : 0;
      if (aShadow !== bShadow) return aShadow - bShadow;
      if (activeIds) {
        const aOn = activeIds.has(a.id) ? 0 : 1;
        const bOn = activeIds.has(b.id) ? 0 : 1;
        if (aOn !== bOn) return aOn - bOn;
      }
      return 0;
    });
    kept.push(ranked[0]);
  }
  return kept;
}

/**
 * Profils dont la colonne role vaut 'supervisor'.
 * Ne pas utiliser pour un écran : un compte d'une séance archivée
 * ou sans séance y figure encore. Préférer getActiveSupervisors.
 * @returns { ok, supervisors }
 */
export async function getSupervisorProfiles() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const selectWithCanonical =
      "id, first_name, last_name, email, canonical_email, account_status, avatar_url, created_at";
    const selectWithoutCanonical =
      "id, first_name, last_name, email, account_status, avatar_url, created_at";
    let { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select(selectWithCanonical)
        .eq("role", "supervisor")
        .order("created_at", { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      "قراءة المشرفين"
    );
    if (
      error &&
      /column .*canonical_email|canonical_email .*does not exist/i.test(error.message || "")
    ) {
      ({ data, error } = await withTimeout(
        supabase
          .from("profiles")
          .select(selectWithoutCanonical)
          .eq("role", "supervisor")
          .order("created_at", { ascending: true }),
        SUPABASE_TIMEOUT_MS,
        "قراءة المشرفين"
      ));
    }
    if (error) {
      return { ok: false, error: mapTableError(error, "profiles") };
    }
    return { ok: true, supervisors: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Profils qui ont le rôle superviseur (colonne role ou tableau roles).
 * Les invitations supervisor_invitations ne sont pas des profils : elles
 * ne sont pas lues ici.
 */
export async function listSupervisorRoleProfiles() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const withRoles =
    "id, first_name, last_name, email, canonical_email, role, roles, account_status";
  const roleOnly =
    "id, first_name, last_name, email, canonical_email, role, account_status";
  try {
    let { data, error } = await withTimeout(
      supabase.from("profiles").select(withRoles).or("role.eq.supervisor,roles.cs.{supervisor}"),
      SUPABASE_TIMEOUT_MS,
      "قراءة المشرفين"
    );
    if (error && /roles|canonical_email|column/i.test(error.message || "")) {
      ({ data, error } = await withTimeout(
        supabase.from("profiles").select(roleOnly).eq("role", "supervisor"),
        SUPABASE_TIMEOUT_MS,
        "قراءة المشرفين"
      ));
    }
    if (error) {
      return { ok: false, error: mapTableError(error, "profiles") };
    }
    return { ok: true, supervisors: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Compteur accueil : séances actives de la saison, plus les comptes
 * superviseur actifs même sans séance. Un inactif ne compte que s'il
 * tient encore une séance active (même règle que l'onglet « الكل »).
 */
export function dashboardSupervisorIds(profiles, seances, saisonId) {
  const assigned = supervisorIdsForSeason(seances, saisonId);
  const visible = excludeDuplicateSupervisorAccounts(
    (profiles || []).filter((profile) => {
      const status = profile?.account_status || "active";
      if (status === "inactive") return assigned.has(profile.id);
      return status === "active";
    }),
    assigned
  );
  const ids = new Set(visible.map((profile) => profile.id).filter(Boolean));
  assigned.forEach((id) => ids.add(id));
  return ids;
}

/**
 * Superviseurs affichés par l'admin : role = 'supervisor' ET affectés à une
 * séance active (statut = active) de la saison demandée.
 * Même règle que l'écran « المشرفون » et le picker « المشرف ».
 * Une séance archivée, inactive, ou d'une autre saison ne compte pas.
 * @param {{ saisonId?: string|null }} options
 * @returns { ok, supervisors }
 */
export async function getActiveSupervisors({ saisonId = null } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!saisonId) {
    return { ok: true, supervisors: [] };
  }
  try {
    const [profilesRes, seancesRes] = await Promise.all([
      getSupervisorProfiles(),
      getAllSeances({ saisonId }),
    ]);
    if (!profilesRes.ok) return profilesRes;
    if (!seancesRes.ok) return { ok: false, error: seancesRes.error };
    const ids = supervisorIdsForSeason(seancesRes.seances, saisonId);
    const eligible = excludeDuplicateSupervisorAccounts(profilesRes.supervisors, ids);
    return {
      ok: true,
      supervisors: eligible.filter((s) => ids.has(s.id)),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Superviseurs activés (account_status active, ou vide) pour affecter une séance.
 * Chaque ligne porte la séance non archivée de la saison, ou null si libre.
 * N'inclut pas les comptes inactive / invited.
 * @param {{ saisonId?: string|null }} options
 * @returns { ok, supervisors: Array<{ id, first_name, last_name, email, account_status, avatar_url, seanceId, seanceNom }> }
 */
export async function getAssignableSupervisors({ saisonId = null } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!saisonId) {
    return { ok: true, supervisors: [] };
  }
  try {
    const [profilesRes, seancesRes] = await Promise.all([
      getSupervisorProfiles(),
      getAllSeances({ saisonId, lite: true }),
    ]);
    if (!profilesRes.ok) return profilesRes;
    if (!seancesRes.ok) return { ok: false, error: seancesRes.error };

    const seanceBySupervisor = new Map();
    for (const seance of filterSeancesForSeason(seancesRes.seances, saisonId)) {
      if (!seance?.superviseur_id || seanceBySupervisor.has(seance.superviseur_id)) continue;
      seanceBySupervisor.set(seance.superviseur_id, {
        id: seance.id,
        nom: seance.nom || "",
      });
    }

    const supervisors = (profilesRes.supervisors || [])
      .filter((profile) => {
        const status = profile?.account_status || "active";
        return status === "active";
      })
      .map((profile) => {
        const seance = seanceBySupervisor.get(profile.id) || null;
        return {
          ...profile,
          seanceId: seance?.id || null,
          seanceNom: seance?.nom || null,
        };
      });

    return { ok: true, supervisors };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Superviseurs de la liste de chat admin.
 * D2 : role = 'supervisor' OU roles contient 'supervisor'
 * (même idée que private.profile_has_role).
 * Sans saison active : liste vide, comme getAssignableSupervisors.
 * Le statut de compte n'est pas filtré ici (filterAdminInboxRows).
 * Fonction dédiée : ne pas élargir getSupervisorProfiles, qui alimente
 * aussi l'affectation de séance (AdminSeasonsScreen).
 * @param {{ saisonId?: string|null }} options
 * @returns { ok, supervisors }
 */
export async function getAdminChatSupervisors({ saisonId = null } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!saisonId) {
    return { ok: true, supervisors: [] };
  }
  try {
    const selectWithCanonical =
      "id, first_name, last_name, email, canonical_email, role, roles, account_status, avatar_url, created_at";
    const selectWithoutCanonical =
      "id, first_name, last_name, email, role, roles, account_status, avatar_url, created_at";
    let { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select(selectWithCanonical)
        .or("role.eq.supervisor,roles.cs.{supervisor}")
        .order("created_at", { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      "قراءة المشرفين"
    );
    if (
      error &&
      /column .*canonical_email|canonical_email .*does not exist/i.test(error.message || "")
    ) {
      ({ data, error } = await withTimeout(
        supabase
          .from("profiles")
          .select(selectWithoutCanonical)
          .or("role.eq.supervisor,roles.cs.{supervisor}")
          .order("created_at", { ascending: true }),
        SUPABASE_TIMEOUT_MS,
        "قراءة المشرفين"
      ));
    }
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
    const selectWithAvatar =
      "id, first_name, last_name, email, phone, school, level, hifz_amount, account_status, created_at, avatar_url";
    const selectWithoutAvatar =
      "id, first_name, last_name, email, phone, school, level, hifz_amount, account_status, created_at";

    let { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select(selectWithAvatar)
        .eq("role", "member")
        .order("created_at", { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      "قراءة الأعضاء"
    );

    if (error && /column.*avatar_url|avatar_url.*does not exist/i.test(error.message || "")) {
      ({ data, error } = await withTimeout(
        supabase
          .from("profiles")
          .select(selectWithoutAvatar)
          .eq("role", "member")
          .order("created_at", { ascending: true }),
        SUPABASE_TIMEOUT_MS,
        "قراءة الأعضاء"
      ));
    }

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
          "id, membre_id, seance_id, saison_id, date_inscription, seance:seances!inscriptions_seance_id_fkey(id, nom, statut, saison_id, jour, heure_debut, heure_fin, superviseur_id, superviseur:profiles!seances_superviseur_id_fkey(id, first_name, last_name, email, canonical_email, avatar_url))"
        )
        .eq("statut", "accepte"),
      SUPABASE_TIMEOUT_MS,
      "قراءة التسجيلات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "inscriptions") };
    }
    let rows = data || [];
    if (saisonId != null && String(saisonId) !== "") {
      const wanted = String(saisonId);
      // Inscrit de CETTE saison : inscriptions.saison_id seul.
      // La séance peut porter un autre id sans faire entrer la ligne.
      rows = rows.filter((row) => String(row.saison_id || "") === wanted);
    }
    return { ok: true, inscriptions: rows };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
