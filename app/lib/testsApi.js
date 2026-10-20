import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { getCurrentAuthId } from "./currentAuth";
import { TEST_TYPE_LABELS, casablancaTodayIso, formatTestTime, getTestDisplayStatus } from "../constants/tests";
import { newUuid } from "./messagesApi";

export { TEST_TYPE_LABELS };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id d'un nouveau test, généré une fois à l'ouverture du formulaire : un
 * nouvel envoi du même formulaire vise la même ligne tests (23505 = déjà créé).
 */
export function newTestId() {
  return newUuid();
}

/** 23505 sur la clé primaire de tests pour cet id précis. */
function isDuplicateTestId(error, testId) {
  if (!error || !testId) return false;
  const isUnique =
    error.code === "23505" || /duplicate key|23505/i.test(error.message || "");
  if (!isUnique) return false;
  const text = `${error.message || ""} ${error.details || ""}`;
  return text.includes(testId) || /tests_pkey/i.test(text);
}

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

/** Traduit une erreur de table Supabase (table absente / RLS / doublon / autre). */
function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/Could not find the .* column|schema cache/i.test(msg)) {
    return `عمود ناقص في جدول ${tableLabel} — نفّذ supabase/migrations/0016_tests_types.sql في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/duplicate key|23505/i.test(msg)) {
    return "سجل مكرر — هذه العملية مسجلة مسبقاً";
  }
  return mapSupabaseAuthError(error);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dates proposées : { date: YYYY-MM-DD, heure: HH:mm }.
 * L'heure est obligatoire. Une seule heure par date : un doublon est refusé.
 * Chaque date est strictement après aujourd'hui à Casablanca. Au moins une.
 */
function normalizeProposedDates(dates) {
  const today = casablancaTodayIso();
  const seen = new Set();
  const unique = [];
  for (const raw of Array.isArray(dates) ? dates : []) {
    const iso = String(raw?.date || "").slice(0, 10);
    const heure = formatTestTime(raw?.heure);
    if (!ISO_DATE.test(iso)) {
      return { ok: false, error: "تاريخ غير صالح" };
    }
    if (!heure) {
      return { ok: false, error: "اختر ساعة للاختبار" };
    }
    if (!today || iso <= today) {
      return { ok: false, error: "يجب اختيار تاريخ لاحق" };
    }
    if (seen.has(iso)) {
      return { ok: false, error: "هذا التاريخ مضاف مسبقاً" };
    }
    seen.add(iso);
    unique.push({ date: iso, heure });
  }
  unique.sort((a, b) => a.date.localeCompare(b.date));
  if (unique.length === 0) {
    return { ok: false, error: "أضف تاريخاً واحداً على الأقل" };
  }
  return { ok: true, dates: unique };
}

/** Remonte le texte arabe du garde-fou, ou une traduction des exceptions 0090. */
function invitationUpdateError(error) {
  const msg = error?.message || "";
  if (msg.includes("لا يمكن تعديل الرد بعد حلول تاريخ الاختبار")) return "لا يمكن تعديل الجواب بعد حلول تاريخ الاختبار";
  if (msg.includes("يجب اختيار تاريخ لاحق")) return "يجب اختيار تاريخ لاحق";
  if (msg.includes("هذا الاختبار لم يعد مفتوحاً للرد")) return "هذا الاختبار لم يعد مفتوحاً للرد";
  if (/déjà notée|deja notee/i.test(msg)) return "لا يمكن تعديل الجواب بعد التنقيط";
  if (error?.code === "23503" || /23503|foreign key/i.test(msg)) {
    return "هذا التاريخ غير مقترح";
  }
  return null;
}

/** Id du membre connecté via la session Supabase, ou null. */
async function currentAuthId() {
  // Id local (AppContext ou session stockée) : pas d'appel réseau. Droits vérifiés par RLS.
  return getCurrentAuthId();
}

/**
 * Invitations du membre, tests non annulés de toutes les saisons actives,
 * avec les dates proposées triées.
 * @returns { ok, invitations }
 */
export async function getMyTestInvitations() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    const { data: activeSeasons, error: seasonError } = await withTimeout(
      supabase.from("saisons").select("id").eq("active", true),
      SUPABASE_TIMEOUT_MS,
      "قراءة المواسم النشطة"
    );
    if (seasonError) {
      return { ok: false, error: mapTableError(seasonError, "saisons") };
    }
    const seasonIds = (activeSeasons || []).map((season) => season.id).filter(Boolean);
    if (seasonIds.length === 0) {
      return { ok: true, invitations: [] };
    }

    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .select(
          "*, test:tests!test_invitations_test_id_fkey!inner(id, titre, saison_id, created_at, type, quran_quantity, statut, test_dates(id, test_id, date_proposee, heure_proposee))"
        )
        .eq("membre_id", userId)
        .neq("test.statut", "annule")
        .in("test.saison_id", seasonIds),
      SUPABASE_TIMEOUT_MS,
      "قراءة دعوات الاختبار"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_invitations") };
    }
    const invitations = (data || []).map((row) => {
      const dates = [...(row.test?.test_dates || [])].sort((a, b) =>
        String(a.date_proposee || "").localeCompare(String(b.date_proposee || ""))
      );
      return { ...row, test: { ...row.test, test_dates: dates } };
    });
    return { ok: true, invitations };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Réponse du membre à une invitation de test (workflow confirme/refuse +
 * choix de date). La policy RLS limite la mise à jour à sa propre invitation
 * et le trigger de garde empêche toute modification hors statut/date_choisie.
 * @param {object} payload { invitationId, statut ('confirme'|'refuse'), dateChoisie (optionnel) }
 * @returns { ok, invitation? }
 */
export async function respondToInvitation({ invitationId, statut, dateChoisie = null }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!invitationId) {
    return { ok: false, error: "معرّف الدعوة مفقود" };
  }
  if (!["confirme", "refuse"].includes(statut)) {
    return { ok: false, error: "حالة غير صالحة — اختر تأكيد أو رفض" };
  }
  if (statut === "confirme" && !dateChoisie) {
    return { ok: false, error: "اختر تاريخاً للاختبار" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  // Le refus efface toujours la date. Le trigger le force aussi.
  const chosen =
    statut === "refuse" ? null : String(dateChoisie || "").slice(0, 10);
  if (statut === "confirme") {
    const today = casablancaTodayIso();
    if (!ISO_DATE.test(chosen) || !today || chosen <= today) {
      return { ok: false, error: "يجب اختيار تاريخ لاحق" };
    }
  }
  const patch = {
    statut,
    date_choisie: chosen,
  };

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .update(patch)
        .eq("id", invitationId)
        .eq("membre_id", userId)
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "تحديث الدعوة"
    );
    if (error) {
      return {
        ok: false,
        error: invitationUpdateError(error) || mapTableError(error, "test_invitations"),
      };
    }
    return { ok: true, invitation: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Admin : déplace un membre sur une autre date proposée, ou l'enregistre
 * comme excusé. Le garde-fou laisse passer private.user_has_role('admin'),
 * y compris pour une date déjà passée. RLS : test_invitations admin_all.
 * @param {string} invitationId
 * @param {{ statut: 'confirme'|'refuse', dateChoisie?: string|null }} payload
 */
export async function adminUpdateInvitation(invitationId, { statut, dateChoisie = null } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!invitationId) {
    return { ok: false, error: "معرّف الدعوة مفقود" };
  }
  if (!["confirme", "refuse"].includes(statut)) {
    return { ok: false, error: "حالة غير صالحة — اختر تأكيد أو رفض" };
  }
  const chosen = statut === "refuse" ? null : String(dateChoisie || "").slice(0, 10);
  if (statut === "confirme" && !ISO_DATE.test(chosen)) {
    return { ok: false, error: "اختر تاريخاً للاختبار" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .update({ statut, date_choisie: chosen })
        .eq("id", invitationId)
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "تحديث الدعوة"
    );
    if (error) {
      return {
        ok: false,
        error: invitationUpdateError(error) || mapTableError(error, "test_invitations"),
      };
    }
    return { ok: true, invitation: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

const MY_TEST_SELECT =
  "id, membre_id, test_id, statut, note, date_choisie, test:tests!test_invitations_test_id_fkey(id, titre, saison_id, created_at, type, quran_quantity, statut)";

/** Aplatit une invitation notée pour mapMemberTestToExam. */
function flattenInvitationResult(row) {
  if (!row) return null;
  const test = row.test || {};
  return {
    id: row.id,
    note: row.note,
    created_at: test.created_at || null,
    test,
    invitation: {
      id: row.id,
      membre_id: row.membre_id,
      test_id: row.test_id,
      statut: row.statut,
      test,
    },
  };
}

/**
 * Résultats de tests du membre connecté.
 * Filtre sur test_invitations.membre_id (colonne réelle) — PostgREST
 * n'accepte pas .eq("invitation.membre_id", …) sur un alias de relation.
 * @returns { ok, results }
 */
export async function getMyTestResults() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .select(MY_TEST_SELECT)
        .eq("membre_id", userId)
        .eq("statut", "note")
        .not("date_notification_resultat", "is", null),
      SUPABASE_TIMEOUT_MS,
      "قراءة نتائج الاختبار"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_invitations") };
    }
    return {
      ok: true,
      results: (data || []).map(flattenInvitationResult).filter(Boolean),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Membres au statut « accepte » dans une séance de la saison, sans doublon.
 * Une expiration de requête est laissée au catch de l'appelant (createTest).
 * @param {string} saisonId
 * @returns {Promise<{ ok: boolean, ids: string[], error?: string }>}
 */
export async function getEligibleMemberIds(saisonId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", ids: [] };
  }
  const seasonId = String(saisonId || "").trim();
  if (!seasonId) {
    return { ok: false, error: "معرّف الموسم مفقود", ids: [] };
  }
  const { data: accepted, error: membersError } = await withTimeout(
    supabase
      .from("inscriptions")
      .select("membre_id, seance:seances!inscriptions_seance_id_fkey!inner(saison_id)")
      .eq("statut", "accepte")
      .eq("seance.saison_id", seasonId),
    SUPABASE_TIMEOUT_MS,
    "قراءة أعضاء الموسم"
  );
  if (membersError) {
    return { ok: false, error: mapTableError(membersError, "inscriptions"), ids: [] };
  }
  return {
    ok: true,
    ids: [...new Set((accepted || []).map((row) => row.membre_id).filter(Boolean))],
  };
}

/**
 * Éligibles qui n'ont pas encore de ligne test_invitations pour ce test.
 * @returns {Promise<{ ok: boolean, ids: string[], error?: string }>}
 */
async function listMissingInviteeIds(testId, saisonId) {
  const eligible = await getEligibleMemberIds(saisonId);
  if (!eligible.ok) return { ok: false, error: eligible.error, ids: [] };
  if (eligible.ids.length === 0) return { ok: true, ids: [] };

  const { data, error } = await withTimeout(
    supabase.from("test_invitations").select("membre_id").eq("test_id", testId),
    SUPABASE_TIMEOUT_MS,
    "قراءة الدعوات"
  );
  if (error) {
    return { ok: false, error: mapTableError(error, "test_invitations"), ids: [] };
  }
  const invited = new Set((data || []).map((row) => row.membre_id).filter(Boolean));
  return { ok: true, ids: eligible.ids.filter((id) => !invited.has(id)) };
}

/** Échec de la suppression de secours : le test existe peut-être encore. */
const CREATE_TEST_INCOMPLETE_MESSAGE = "تعذّر إكمال إنشاء الاختبار، أعد المحاولة";

function isUniqueViolation(error) {
  return error?.code === "23505" || /duplicate key|23505/i.test(error?.message || "");
}

/** Insère les dates proposées du formulaire. @returns {{ ok: true } | { ok: false, error }} */
async function insertTestDates(testId, proposedDates) {
  const { error } = await withTimeout(
    supabase.from("test_dates").insert(
      proposedDates.map((slot) => ({
        test_id: testId,
        date_proposee: slot.date,
        heure_proposee: slot.heure,
      }))
    ),
    SUPABASE_TIMEOUT_MS,
    "حفظ تواريخ الاختبار"
  );
  if (!error) return { ok: true };
  if (isUniqueViolation(error)) {
    return { ok: false, error: "هذا التاريخ مضاف مسبقاً" };
  }
  return { ok: false, error: mapTableError(error, "test_dates") };
}

/**
 * Invite tous les éligibles de la saison. Upsert onConflict (test_id, membre_id)
 * avec ignoreDuplicates (ON CONFLICT DO NOTHING) : une invitation déjà présente
 * n'est pas réinsérée, donc trg_test_invitation_announce (AFTER INSERT, 0094)
 * ne se redéclenche pas pour elle.
 * @returns {{ ok: true, inserted: object[] } | { ok: false, error, stage }}
 *   stage : "eligibles" (lecture) ou "invitations" (écriture).
 */
async function inviteEligibleMembers(testId, seasonId) {
  const eligible = await getEligibleMemberIds(seasonId);
  if (!eligible.ok) {
    return { ok: false, error: eligible.error, stage: "eligibles" };
  }
  if (eligible.ids.length === 0) {
    return { ok: true, inserted: [] };
  }
  const { data, error } = await withTimeout(
    supabase
      .from("test_invitations")
      .upsert(
        eligible.ids.map((membre_id) => ({
          test_id: testId,
          membre_id,
          statut: "invite",
        })),
        { onConflict: "test_id,membre_id", ignoreDuplicates: true }
      )
      .select("*"),
    SUPABASE_TIMEOUT_MS,
    "إرسال الدعوات"
  );
  if (error) {
    return {
      ok: false,
      error: mapTableError(error, "test_invitations"),
      stage: "invitations",
    };
  }
  return { ok: true, inserted: data || [] };
}

/**
 * Suppression de secours d'un test à moitié créé (cascade vers test_dates et
 * test_invitations). `.select("id")` : une suppression filtrée par RLS ne
 * renvoie pas d'erreur, seulement 0 ligne ; elle compte comme un échec.
 * @returns {Promise<boolean>} true si la ligne a bien été supprimée.
 */
async function rollbackTest(testId) {
  try {
    const { data, error } = await withTimeout(
      supabase.from("tests").delete().eq("id", testId).select("id"),
      SUPABASE_TIMEOUT_MS,
      "إلغاء الاختبار"
    );
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * (Admin) Crée un test de saison puis invite tous les membres acceptés
 * dans une séance de cette saison. saisonId est obligatoire.
 * `id` (optionnel, UUID de newTestId) : envoyé à l'insert. Si la ligne existe
 * déjà (23505 sur cet id : envoi répété), le test est complété (dates si
 * absentes, invitations manquantes) au lieu d'être recréé : voir resumeTest.
 * @param {object} payload { id?, saisonId, titre, type, quranQuantity?, dates: { date, heure }[] }
 * @returns { ok, test?, invitations?, invitedCount?, alreadyCreated? }
 */
export async function createTest({
  id = null,
  saisonId,
  titre = null,
  type = "hifz",
  quranQuantity = null,
  dates = [],
}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const seasonId = String(saisonId || "").trim();
  if (!seasonId) {
    return { ok: false, error: "معرّف الموسم مفقود" };
  }
  const testType = type === "sunnah" ? "sunnah" : "hifz";
  const title = String(titre || "").trim();
  if (!title) {
    return { ok: false, error: "أدخل عنوان الاختبار" };
  }
  if (testType === "hifz" && !String(quranQuantity || "").trim()) {
    return { ok: false, error: "مقدار الحفظ إلزامي لاختبار الحفظ" };
  }
  const proposed = normalizeProposedDates(dates);
  if (!proposed.ok) return proposed;
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const testId = id && UUID_RE.test(String(id)) ? String(id) : null;
  const row = {
    ...(testId ? { id: testId } : {}),
    titre: title,
    type: testType,
    saison_id: seasonId,
    quran_quantity: testType === "hifz" ? String(quranQuantity).trim() : null,
    created_by: userId,
  };

  try {
    const { data, error } = await withTimeout(
      supabase.from("tests").insert(row).select("*").single(),
      SUPABASE_TIMEOUT_MS,
      "إنشاء الاختبار"
    );
    if (error) {
      if (isDuplicateTestId(error, testId)) {
        // await : un délai dépassé pendant la reprise est capturé par le catch.
        return await resumeTest(testId, seasonId, proposed.dates);
      }
      return { ok: false, error: mapTableError(error, "tests") };
    }

    const datesRes = await insertTestDates(data.id, proposed.dates);
    if (!datesRes.ok) {
      if (!(await rollbackTest(data.id))) {
        return { ok: false, error: CREATE_TEST_INCOMPLETE_MESSAGE };
      }
      return { ok: false, error: datesRes.error };
    }

    const inviteRes = await inviteEligibleMembers(data.id, seasonId);
    if (!inviteRes.ok) {
      // Lecture des éligibles impossible : le test et ses dates restent ; un
      // nouvel appui (même id) reprend à l'étape des invitations.
      if (inviteRes.stage === "eligibles") {
        return { ok: false, error: inviteRes.error };
      }
      if (!(await rollbackTest(data.id))) {
        return { ok: false, error: CREATE_TEST_INCOMPLETE_MESSAGE };
      }
      return { ok: false, error: inviteRes.error };
    }
    return {
      ok: true,
      test: data,
      invitations: inviteRes.inserted,
      invitedCount: inviteRes.inserted.length,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Envoi répété d'un même formulaire : le test existe déjà sous cet id
 * (première tentative interrompue : délai dépassé, lecture des éligibles ou
 * suppression de secours en échec). Complète ce qui manque, sans rien supprimer :
 *   1. aucune ligne test_dates → insère les dates du formulaire ;
 *   2. invitations des éligibles (idempotent, pas de notification en double).
 * Succès seulement si dates et invitations sont en place.
 */
async function resumeTest(testId, formSeasonId, proposedDates) {
  const { data: test, error } = await withTimeout(
    supabase.from("tests").select("*").eq("id", testId).maybeSingle(),
    SUPABASE_TIMEOUT_MS,
    "قراءة الاختبار"
  );
  if (error) {
    return { ok: false, error: mapTableError(error, "tests") };
  }
  if (!test) {
    return { ok: false, error: CREATE_TEST_INCOMPLETE_MESSAGE };
  }

  const { count: datesCount, error: countError } = await withTimeout(
    supabase
      .from("test_dates")
      .select("id", { count: "exact", head: true })
      .eq("test_id", testId),
    SUPABASE_TIMEOUT_MS,
    "قراءة تواريخ الاختبار"
  );
  if (countError) {
    return { ok: false, error: mapTableError(countError, "test_dates") };
  }
  if (!datesCount) {
    const datesRes = await insertTestDates(testId, proposedDates);
    if (!datesRes.ok) return { ok: false, error: datesRes.error };
  }

  const seasonId = String(test.saison_id || formSeasonId || "").trim();
  const inviteRes = await inviteEligibleMembers(testId, seasonId);
  if (!inviteRes.ok) {
    return { ok: false, error: inviteRes.error };
  }

  // Total (invitations de la première tentative + celles ajoutées ici).
  const { data: invitations, error: invError } = await withTimeout(
    supabase.from("test_invitations").select("*").eq("test_id", testId),
    SUPABASE_TIMEOUT_MS,
    "قراءة الدعوات"
  );
  const invited = invError ? inviteRes.inserted : invitations || [];
  return {
    ok: true,
    test,
    invitations: invited,
    invitedCount: invited.length,
    alreadyCreated: true,
  };
}

/**
 * (Admin) Nombre de membres éligibles sans ligne dans test_invitations.
 * @returns { ok, count }
 */
export async function getMissingInviteesCount(testId, saisonId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", count: 0 };
  }
  if (!testId) {
    return { ok: false, error: "معرّف الاختبار مفقود", count: 0 };
  }
  try {
    const missing = await listMissingInviteeIds(testId, saisonId);
    if (!missing.ok) return { ok: false, error: missing.error, count: 0 };
    return { ok: true, count: missing.ids.length };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", count: 0 };
  }
}

/**
 * (Admin) Invite les membres éligibles encore absents de ce test.
 * Le trigger d'annonce (0094) envoie la notification.
 * @returns { ok, count }
 */
export async function inviteMissingMembers(testId, saisonId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", count: 0 };
  }
  if (!testId) {
    return { ok: false, error: "معرّف الاختبار مفقود", count: 0 };
  }
  try {
    const missing = await listMissingInviteeIds(testId, saisonId);
    if (!missing.ok) return { ok: false, error: missing.error, count: 0 };
    if (missing.ids.length === 0) return { ok: true, count: 0 };

    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .upsert(
          missing.ids.map((membre_id) => ({
            test_id: testId,
            membre_id,
            statut: "invite",
          })),
          { onConflict: "test_id,membre_id", ignoreDuplicates: true }
        )
        .select("id"),
      SUPABASE_TIMEOUT_MS,
      "إرسال الدعوات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_invitations"), count: 0 };
    }
    return { ok: true, count: (data || []).length };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", count: 0 };
  }
}

/**
 * Invitation de membres à un test (statut initial 'invite').
 * @param {object} payload { testId, membreIds: string[] }
 * @returns { ok, invitations? }
 */
export async function inviteMembers({ testId, membreIds }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const ids = Array.isArray(membreIds) ? [...new Set(membreIds.filter(Boolean))] : [];
  if (!testId) {
    return { ok: false, error: "معرّف الاختبار مفقود" };
  }
  if (ids.length === 0) {
    return { ok: false, error: "اختر عضواً واحداً على الأقل" };
  }

  try {
    const rows = ids.map((membre_id) => ({ test_id: testId, membre_id, statut: "invite" }));
    const { data, error } = await withTimeout(
      supabase.from("test_invitations").insert(rows).select("*"),
      SUPABASE_TIMEOUT_MS,
      "إرسال الدعوات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_invitations") };
    }
    return { ok: true, invitations: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Note une invitation confirmée. La note est sur test_invitations.
 * @param {object} payload { invitationId, note }
 * @returns { ok, result? }
 */
export async function recordTestResult({ invitationId, note }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!invitationId) {
    return { ok: false, error: "معرّف الدعوة مفقود" };
  }
  const noteValue = Number(note);
  if (note === null || note === undefined || note === "" || Number.isNaN(noteValue)) {
    return { ok: false, error: "أدخل نقطة صحيحة" };
  }
  if (noteValue < 0 || noteValue > 20) {
    return { ok: false, error: "النقطة يجب أن تكون بين 0 و 20" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .update({ note: noteValue, statut: "note" })
        .eq("id", invitationId)
        .in("statut", ["confirme", "note"])
        .is("date_notification_resultat", null)
        .select("*"),
      SUPABASE_TIMEOUT_MS,
      "حفظ النتيجة"
    );
    if (error) {
      const msg = error?.message || "";
      if (/seule une invitation confirmée/i.test(msg)) {
        return { ok: false, error: "لا يمكن تسجيل النقطة إلا لدعوة مؤكدة" };
      }
      return { ok: false, error: mapTableError(error, "test_invitations") };
    }
    if (!data || data.length === 0) {
      return { ok: false, error: "لا يمكن تعديل النقطة بعد إرسال النتائج أو لدعوة غير مؤكدة" };
    }
    return { ok: true, result: data[0] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export function mapTestToDashboardExam(test) {
  const statut = test?.statut;
  return {
    id: test?.id,
    title: test?.titre || "اختبار",
    status:
      statut === "annule"
        ? "cancelled"
        : statut === "termine"
          ? "completed"
          : "planned",
    createdAt: test?.created_at || null,
    date: test?.created_at || null,
    statut,
    test_dates: Array.isArray(test?.test_dates) ? test.test_dates : [],
    invitations: Array.isArray(test?.invitations) ? test.invitations : [],
    displayStatus: getTestDisplayStatus(test),
  };
}

export function mapMemberTestToExam(row) {
  const invitation = row?.invitation || row;
  const test = invitation?.test || row?.test || {};
  const note = row?.note;
  return {
    id: row?.id || invitation?.id,
    title: test.titre || "اختبار",
    date: test.created_at || row?.created_at || null,
    score: note == null ? "" : String(note),
    level: TEST_TYPE_LABELS[test.type] || test.titre || "",
    memberId: invitation?.membre_id || null,
  };
}

/**
 * Compteur admin (head request).
 * statut optionnel : sans argument, tous les tests (tableau de bord).
 */
export async function countTestsAdmin(statut = null, saisonId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", count: 0 };
  }
  try {
    let query = supabase.from("tests").select("id", { count: "exact", head: true });
    if (statut) query = query.eq("statut", statut);
    if (saisonId) query = query.eq("saison_id", saisonId);
    const { count, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "عدّ الاختبارات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "tests"), count: 0 };
    }
    return { ok: true, count: count || 0 };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      count: 0,
    };
  }
}

/** Tests encore au statut planifie : badge du menu admin. */
export function countPlannedTestsAdmin() {
  return countTestsAdmin("planifie");
}

/** Derniers tests pour le fil d'activité admin. */
export async function listRecentTestsAdmin(limit = 10, saisonId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", tests: [] };
  }
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
  try {
    let query = supabase
      .from("tests")
      .select(
        "id, titre, statut, created_at, saison_id, test_dates(date_proposee), invitations:test_invitations!test_invitations_test_id_fkey(statut)"
      )
      .order("created_at", { ascending: false })
      .limit(take);
    if (saisonId) query = query.eq("saison_id", saisonId);
    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "قراءة آخر الاختبارات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "tests"), tests: [] };
    }
    return { ok: true, tests: data || [] };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      tests: [],
    };
  }
}

/**
 * (Admin) Ajoute une date proposée, strictement future à Casablanca, avec son heure.
 * @returns { ok, date? }
 */
export async function addTestDate(testId, date, heure) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!testId) {
    return { ok: false, error: "معرّف الاختبار مفقود" };
  }
  const proposed = normalizeProposedDates([{ date, heure }]);
  if (!proposed.ok) return proposed;
  const slot = proposed.dates[0];
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_dates")
        .insert({
          test_id: testId,
          date_proposee: slot.date,
          heure_proposee: slot.heure,
        })
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "إضافة تاريخ"
    );
    if (error) {
      if (error.code === "23505" || /duplicate key|23505/i.test(error.message || "")) {
        return { ok: false, error: "هذا التاريخ مضاف مسبقاً" };
      }
      return { ok: false, error: mapTableError(error, "test_dates") };
    }
    return { ok: true, date: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Change l'heure d'une date déjà proposée. La date elle-même ne bouge pas.
 * @returns { ok, date? }
 */
export async function updateTestDateHeure(testDateId, heure) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!testDateId) {
    return { ok: false, error: "معرّف التاريخ مفقود" };
  }
  const formatted = formatTestTime(heure);
  if (!formatted) {
    return { ok: false, error: "اختر ساعة للاختبار" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_dates")
        .update({ heure_proposee: formatted })
        .eq("id", testDateId)
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "تعديل وقت الاختبار"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_dates") };
    }
    return { ok: true, date: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Retire une date proposée. Refusé si un membre l'a déjà choisie (23503).
 * @returns { ok }
 */
export async function removeTestDate(testDateId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!testDateId) {
    return { ok: false, error: "معرّف التاريخ مفقود" };
  }
  try {
    const { error } = await withTimeout(
      supabase.from("test_dates").delete().eq("id", testDateId),
      SUPABASE_TIMEOUT_MS,
      "حذف تاريخ"
    );
    if (error) {
      if (error.code === "23503" || /23503|foreign key/i.test(error.message || "")) {
        return { ok: false, error: "لا يمكن حذف تاريخ اختاره أحد الأعضاء" };
      }
      return { ok: false, error: mapTableError(error, "test_dates") };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Dates proposées d'un test, triées.
 * @returns { ok, dates }
 */
export async function getTestDates(testId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!testId) {
    return { ok: false, error: "معرّف الاختبار مفقود" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_dates")
        .select("id, test_id, date_proposee, heure_proposee, created_at")
        .eq("test_id", testId)
        .order("date_proposee", { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      "قراءة تواريخ الاختبار"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_dates") };
    }
    return { ok: true, dates: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Tous les tests, avec la séance et les invitations jointes.
 * RLS : tests_admin_all / inscriptions via private.is_admin() (0009).
 * @returns { ok, tests }
 */
export async function getAllTestsAdmin() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("tests")
        .select(
          "*, saison:saisons!tests_saison_id_fkey(id, name), invitations:test_invitations!test_invitations_test_id_fkey(id, statut, date_choisie), test_dates(date_proposee)"
        )
        .order("created_at", { ascending: false }),
      SUPABASE_TIMEOUT_MS,
      "قراءة الاختبارات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "tests") };
    }
    return { ok: true, tests: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Invitations confirmées d'un test, groupées par date choisie.
 * @param {string} testId
 * @returns { ok, groups?: { dateChoisie: string, invitations: object[] }[] }
 */
export async function getTestCollecte(testId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!testId) {
    return { ok: false, error: "معرّف الاختبار مفقود" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .select(
          "id, membre_id, date_choisie, statut, membre:profiles!test_invitations_membre_id_fkey(first_name, last_name)"
        )
        .eq("test_id", testId)
        .eq("statut", "confirme")
        .order("date_choisie", { ascending: true }),
      SUPABASE_TIMEOUT_MS,
      "جمع مواعيد الاختبار"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_invitations") };
    }
    const groups = new Map();
    for (const row of data || []) {
      const dateChoisie = row.date_choisie || "";
      const list = groups.get(dateChoisie) || [];
      list.push(row);
      groups.set(dateChoisie, list);
    }
    return {
      ok: true,
      groups: [...groups.entries()].map(([dateChoisie, invitations]) => ({
        dateChoisie,
        invitations,
      })),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Pose date_notification_resultat sur les invitations déjà notées
 * et pas encore envoyées. Le trigger 0091 notifie chaque membre.
 * @param {string} testId
 * @returns { ok, count }
 */
export async function markResultsNotified(testId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", count: 0 };
  }
  if (!testId) {
    return { ok: false, error: "معرّف الاختبار مفقود", count: 0 };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .update({ date_notification_resultat: new Date().toISOString() })
        .eq("test_id", testId)
        .eq("statut", "note")
        .is("date_notification_resultat", null)
        .select("id"),
      SUPABASE_TIMEOUT_MS,
      "إرسال النتائج"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_invitations"), count: 0 };
    }
    return { ok: true, count: (data || []).length };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", count: 0 };
  }
}

/**
 * (Admin) Invitations d'un test avec le profil de chaque membre.
 * La note, si elle existe, est sur la ligne d'invitation.
 * @param {string} testId
 * @returns { ok, invitations }
 */
export async function getTestInvitationsWithMembers(testId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!testId) {
    return { ok: false, error: "معرّف الاختبار مفقود" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .select(
          "*, membre:profiles!test_invitations_membre_id_fkey(first_name, last_name, email)"
        )
        .eq("test_id", testId),
      SUPABASE_TIMEOUT_MS,
      "قراءة دعوات الاختبار"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_invitations") };
    }
    return { ok: true, invitations: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin / Superviseur) Positionnement du statut d'un test (migration
 * 0012 : planifie / termine / annule). RLS : tests_admin_all ou
 * tests_write_superviseur.
 * @param {object} payload { testId, statut }
 * @returns { ok, test? }
 */
export async function updateTestStatus({ testId, statut }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!testId) {
    return { ok: false, error: "معرّف الاختبار مفقود" };
  }
  if (!["planifie", "termine", "annule"].includes(statut)) {
    return { ok: false, error: "حالة غير صالحة للاختبار" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("tests")
        .update({ statut })
        .eq("id", testId)
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "تحديث حالة الاختبار"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "tests") };
    }
    return { ok: true, test: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
