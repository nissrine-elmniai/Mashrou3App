import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";

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

/** Id du membre connecté via la session Supabase, ou null. */
async function currentAuthId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/**
 * Invitations de test du membre connecté, avec le titre du test joint.
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
    const { data, error } = await withTimeout(
      supabase
        .from("test_invitations")
        .select(
          "*, test:tests!test_invitations_test_id_fkey(id, titre, seance_id, created_at, type, date_test, quran_quantity, form_url)"
        )
        .eq("membre_id", userId)
        .order("created_at", { ascending: false }),
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

  const patch = {
    statut,
    date_choisie: dateChoisie || null,
    updated_at: new Date().toISOString(),
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
      return { ok: false, error: mapTableError(error, "test_invitations") };
    }
    return { ok: true, invitation: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Résultats de tests du membre connecté (via ses invitations).
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
        .from("test_resultats")
        .select(
          "*, invitation:test_invitations!test_resultats_test_invitation_id_fkey(*, test:tests!test_invitations_test_id_fkey(titre, created_at))"
        )
        .eq("invitation.membre_id", userId)
        .order("created_at", { ascending: false }),
      SUPABASE_TIMEOUT_MS,
      "قراءة نتائج الاختبار"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_resultats") };
    }
    return { ok: true, results: data || [] };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

export const TEST_TYPE_LABELS = {
  hifz: "اختبار الحفظ",
  sunnah: "حفاظ السنة",
};

/**
 * (Admin) Création d'un test :
 *  - hifz   : date + quantité de Coran
 *  - sunnah : date + lien Google Form
 * @param {object} payload { type, dateTest, quranQuantity?, formUrl?, seanceId? }
 * @returns { ok, test? }
 */
export async function createTest({
  type = "hifz",
  dateTest,
  quranQuantity = null,
  formUrl = null,
  seanceId = null,
  titre = null,
}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  const testType = type === "sunnah" ? "sunnah" : "hifz";
  const title = String(titre || "").trim();
  if (!title) {
    return { ok: false, error: "أدخل عنوان الاختبار" };
  }
  const date = String(dateTest || "").trim();
  if (!date) {
    return { ok: false, error: "أعلن تاريخ الاختبار" };
  }
  if (testType === "hifz" && !String(quranQuantity || "").trim()) {
    return { ok: false, error: "أدخل كمية القرآن المراد تقييمها" };
  }
  if (testType === "sunnah") {
    const url = String(formUrl || "").trim();
    if (!url) {
      return { ok: false, error: "أدخل رابط نموذج Google Form" };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: "رابط Google Form غير صالح — يجب أن يبدأ بـ https://" };
    }
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const row = {
    titre: title,
    type: testType,
    date_test: date,
    quran_quantity: testType === "hifz" ? String(quranQuantity).trim() : null,
    form_url: testType === "sunnah" ? String(formUrl).trim() : null,
    created_by: userId,
  };
  if (seanceId) row.seance_id = seanceId;

  try {
    const { data, error } = await withTimeout(
      supabase.from("tests").insert(row).select("*").single(),
      SUPABASE_TIMEOUT_MS,
      "إنشاء الاختبار"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "tests") };
    }
    return { ok: true, test: data };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Superviseur) Invitation de membres à un test (statut initial 'en_attente').
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
    const rows = ids.map((membre_id) => ({ test_id: testId, membre_id, statut: "en_attente" }));
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
 * (Superviseur) Saisie du résultat d'un test pour une invitation.
 * @param {object} payload { invitationId, note (number), commentaire (optionnel) }
 * @returns { ok, result? }
 */
export async function recordTestResult({ invitationId, note, commentaire = null }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!invitationId) {
    return { ok: false, error: "معرّف الدعوة مفقود" };
  }
  if (note === null || note === undefined || note === "" || isNaN(Number(note))) {
    return { ok: false, error: "أدخل نقطة صحيحة" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("test_resultats")
        .insert({
          test_invitation_id: invitationId,
          note: Number(note),
          commentaire: commentaire || null,
          noted_by: userId,
        })
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ النتيجة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "test_resultats") };
    }
    return { ok: true, result: data };
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
          "*, seance:seances!tests_seance_id_fkey(id, nom), invitations:test_invitations!test_invitations_test_id_fkey(id, statut, date_choisie)"
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
 * (Admin) Tests d'une séance donnée (invitations jointes).
 * @param {string} seanceId
 * @returns { ok, tests }
 */
export async function getSeanceTests(seanceId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!seanceId) {
    return { ok: false, error: "معرّف الحصة مفقود" };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("tests")
        .select(
          "*, invitations:test_invitations!test_invitations_test_id_fkey(id, statut, date_choisie)"
        )
        .eq("seance_id", seanceId)
        .order("created_at", { ascending: false }),
      SUPABASE_TIMEOUT_MS,
      "قراءة اختبارات الحصة"
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
 * (Admin) Invitations d'un test avec le profil de chaque membre et son
 * résultat (notation) éventuel.
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
          "*, membre:profiles!test_invitations_membre_id_fkey(first_name, last_name, email), resultat:test_resultats!test_resultats_test_invitation_id_fkey(note, commentaire, created_at)"
        )
        .eq("test_id", testId)
        .order("created_at", { ascending: true }),
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
