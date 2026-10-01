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
          "*, test:tests!test_invitations_test_id_fkey(id, titre, saison_id, created_at, type, quran_quantity, statut)"
        )
        .eq("membre_id", userId),
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
        .eq("statut", "note"),
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

export const TEST_TYPE_LABELS = {
  hifz: "اختبار الحفظ",
  sunnah: "حفاظ السنة",
};

/**
 * (Admin) Crée un test de saison puis invite tous les membres acceptés
 * dans une séance de cette saison. saisonId est obligatoire.
 * @param {object} payload { saisonId, titre, type, quranQuantity? }
 * @returns { ok, test?, invitations?, invitedCount? }
 */
export async function createTest({
  saisonId,
  titre = null,
  type = "hifz",
  quranQuantity = null,
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
    return { ok: false, error: "أدخل كمية القرآن المراد تقييمها" };
  }
  const userId = await currentAuthId();
  if (!userId) {
    return { ok: false, error: "يجب تسجيل الدخول" };
  }

  const row = {
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
      return { ok: false, error: mapTableError(error, "tests") };
    }

    const { data: accepted, error: membersError } = await withTimeout(
      supabase
        .from("inscriptions")
        .select(
          "membre_id, seance:seances!inscriptions_seance_id_fkey!inner(saison_id)"
        )
        .eq("statut", "accepte")
        .eq("seance.saison_id", seasonId),
      SUPABASE_TIMEOUT_MS,
      "قراءة أعضاء الموسم"
    );
    if (membersError) {
      return { ok: false, error: mapTableError(membersError, "inscriptions"), test: data };
    }

    const membreIds = [
      ...new Set((accepted || []).map((row) => row.membre_id).filter(Boolean)),
    ];
    if (membreIds.length === 0) {
      return { ok: true, test: data, invitations: [], invitedCount: 0 };
    }

    const { data: invitations, error: inviteError } = await withTimeout(
      supabase
        .from("test_invitations")
        .upsert(
          membreIds.map((membre_id) => ({
            test_id: data.id,
            membre_id,
            statut: "invite",
          })),
          { onConflict: "test_id,membre_id", ignoreDuplicates: true }
        )
        .select("*"),
      SUPABASE_TIMEOUT_MS,
      "إرسال الدعوات"
    );
    if (inviteError) {
      return { ok: false, error: mapTableError(inviteError, "test_invitations"), test: data };
    }
    const invited = invitations || [];
    return { ok: true, test: data, invitations: invited, invitedCount: invited.length };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
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
    id: test.id,
    title: test.titre || "اختبار",
    status:
      statut === "annule"
        ? "cancelled"
        : statut === "termine"
          ? "completed"
          : "planned",
    createdAt: test.created_at || null,
    date: test.created_at || null,
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

/** Compteur admin (head request). */
export async function countTestsAdmin() {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", count: 0 };
  }
  try {
    const { count, error } = await withTimeout(
      supabase.from("tests").select("id", { count: "exact", head: true }),
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

/** Derniers tests pour le fil d'activité admin. */
export async function listRecentTestsAdmin(limit = 10) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", tests: [] };
  }
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("tests")
        .select("id, titre, statut, created_at, saison_id")
        .order("created_at", { ascending: false })
        .limit(take),
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
          "*, saison:saisons!tests_saison_id_fkey(id, name), invitations:test_invitations!test_invitations_test_id_fkey(id, statut, date_choisie)"
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
