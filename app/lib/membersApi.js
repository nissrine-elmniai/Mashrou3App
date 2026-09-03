import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { sortSeancesByJour } from "./seancesApi";

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

/** Log structuré d'une erreur PostgREST / Postgres (diagnostic QA). */
function logSupabaseError(context, error) {
  if (!error) return;
  console.error(`[membersApi] ${context}`, {
    code: error.code,
    message: error.message,
    hint: error.hint,
    details: error.details,
  });
}

function isMissingColumnOrRelationship(error) {
  const msg = error?.message || "";
  const code = error?.code || "";
  return (
    code === "42703" ||
    /column.*does not exist/i.test(msg) ||
    /relationship|PGRST200|Could not find a relationship/i.test(msg)
  );
}

function seasonStartFromRow(row) {
  return row?.date_debut || row?.start_date || row?.saisons?.date_debut || row?.saisons?.start_date || null;
}

function withNormalizedSaison(seance, startDate) {
  if (!seance) return seance;
  const date_debut = startDate || seasonStartFromRow(seance);
  if (!date_debut) return seance;
  return { ...seance, saisons: { date_debut, start_date: date_debut } };
}

/** Traduit une erreur de table Supabase (table absente / RLS / doublon / autre). */
function mapTableError(error, tableLabel) {
  const msg = error?.message || "";
  if (/Could not find a relationship|PGRST200/i.test(msg)) {
    return `علاقة مفقودة بين الجداول (${tableLabel}) — نفّذ migrations Supabase (FK PostgREST)`;
  }
  if (/relation.*does not exist|Could not find the table/i.test(msg)) {
    return `جدول ${tableLabel} غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor`;
  }
  if (/permission|row-level security|RLS|42501|violates row/i.test(msg)) {
    return "لا صلاحية كافية لهذه العملية";
  }
  if (/duplicate key|23505/i.test(msg)) {
    return "سجل مكرر — هذه العملية مسجلة مسبقاً";
  }
  if (/column.*does not exist/i.test(msg)) {
    return `عمود مفقود في ${tableLabel} — راجع migrations Supabase`;
  }
  return mapSupabaseAuthError(error);
}

async function querySupervisorActiveSeances(supervisorAuthId, selectClause) {
  return withTimeout(
    supabase
      .from("seances")
      .select(selectClause)
      .eq("superviseur_id", supervisorAuthId)
      .eq("statut", "active")
      .order("created_at", { ascending: true }),
    SUPABASE_TIMEOUT_MS,
    "قراءة الحصص النشطة"
  );
}

async function fetchSaisonStartDates(saisonIds) {
  const first = await withTimeout(
    supabase.from("saisons").select("id, start_date").in("id", saisonIds),
    SUPABASE_TIMEOUT_MS,
    "قراءة تواريخ المواسم"
  );
  if (!first.error && first.data) {
    return first.data;
  }

  // Log obligatoire : un select sur une colonne inexistante était avalé ici,
  // et l'écran Présence affichait un fallback sans aucune trace PostgREST.
  if (first.error) {
    console.warn(
      "[membersApi] lecture saisons.start_date échouée — tentative date_debut:",
      first.error.message || first.error
    );
  }

  if (isMissingColumnOrRelationship(first.error)) {
    const fallback = await withTimeout(
      supabase.from("saisons").select("id, date_debut").in("id", saisonIds),
      SUPABASE_TIMEOUT_MS,
      "قراءة تواريخ المواسم"
    );
    if (!fallback.error && fallback.data) {
      return fallback.data;
    }
    if (fallback.error) {
      console.warn(
        "[membersApi] lecture saisons.date_debut échouée — historique présence sans date de saison:",
        fallback.error.message || fallback.error
      );
    }
  }

  return [];
}

async function attachSaisonDatesToSeances(seances) {
  const list = Array.isArray(seances) ? seances : seances ? [seances] : [];
  const missing = list.filter((s) => s && !seasonStartFromRow(s) && s.saison_id);
  if (missing.length === 0) {
    return list.map((s) => withNormalizedSaison(s));
  }

  const saisonIds = [...new Set(missing.map((s) => s.saison_id).filter(Boolean))];
  const rows = await fetchSaisonStartDates(saisonIds);
  const dateById = Object.fromEntries(
    (rows || []).map((row) => [row.id, seasonStartFromRow(row)]).filter(([, date]) => date)
  );

  return list.map((s) => {
    if (!s) return s;
    const date_debut = seasonStartFromRow(s) || dateById[s.saison_id];
    return withNormalizedSaison(s, date_debut);
  });
}

/**
 * Séances actives du superviseur connecté (auth user id = profiles.id).
 * Un superviseur peut avoir plusieurs séances (ex. hommes / femmes).
 * @returns {{ ok: boolean, seances?: object[], error?: string }}
 */
export async function getSupervisorActiveSeances(supervisorAuthId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", seances: [] };
  }
  if (!supervisorAuthId) {
    return { ok: false, error: "معرّف المشرف مفقود", seances: [] };
  }

  try {
    const withSaison = await querySupervisorActiveSeances(
      supervisorAuthId,
      "*, saisons(start_date)"
    );
    let rows = withSaison.data || [];
    let error = withSaison.error;

    if (error && isMissingColumnOrRelationship(error)) {
      // Pas de FK seances → saisons : PostgREST refuse l'embed.
      // On relit les séances sans dates, puis attachSaisonDatesToSeances.
      console.warn(
        "[membersApi] embed saisons(start_date) indisponible — repli select(*) sans dates de saison:",
        error.message || error
      );
      const fallback = await querySupervisorActiveSeances(supervisorAuthId, "*");
      rows = fallback.data || [];
      error = fallback.error;
    }

    if (error) {
      logSupabaseError("getSupervisorActiveSeances", error);
      return { ok: false, error: mapTableError(error, "seances"), seances: [] };
    }

    const seances = await attachSaisonDatesToSeances(rows || []);
    return { ok: true, seances: sortSeancesByJour(seances) };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      seances: [],
    };
  }
}

/**
 * Séance active principale du superviseur (première après tri par jour).
 * Si seanceId précisé : retourne cette séance. Inclut aussi `seances` (liste complète).
 * RLS : seances_select_own (superviseur_id = auth.uid()).
 * @param {string} supervisorAuthId UUID du profil superviseur
 * @param {string|null} [seanceId] UUID optionnel de la séance ciblée
 * @returns {{ ok: boolean, seance?: object|null, seances?: object[], error?: string }}
 */
export async function getSupervisorActiveSeance(supervisorAuthId, seanceId = null) {
  const res = await getSupervisorActiveSeances(supervisorAuthId);
  if (!res.ok) {
    return { ok: false, error: res.error, seance: null, seances: [] };
  }

  const seances = res.seances || [];
  if (seanceId) {
    const match = seances.find((s) => s.id === seanceId) || null;
    return { ok: true, seance: match, seances };
  }

  return { ok: true, seance: seances[0] || null, seances };
}

/**
 * Membres inscrits (statut = 'accepte') d'une séance, normalisés pour
 * useSupervisorMembers : identité via profiles (FK inscriptions.membre_id).
 *
 * Colonnes inscriptions : membre_id, seance_id, statut ('accepte' | …),
 * date_inscription (schéma distant) ou created_at (migration 0003).
 * dateNaissance / genre : non disponibles via profiles — restent null (jointure membres non faite).
 *
 * @param {string} seanceId UUID de la séance
 * @returns {{ ok: boolean, members?: Array, error?: string }}
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
        .select(
          "membre_id, statut, date_inscription, membre:profiles!inscriptions_membre_id_fkey(id, first_name, last_name, email, phone, school, level, hifz_amount)"
        )
        .eq("seance_id", seanceId)
        .eq("statut", "accepte"),
      SUPABASE_TIMEOUT_MS,
      "قراءة أعضاء الحصة"
    );
    if (error) {
      logSupabaseError("getSeanceMembers", error);
      return { ok: false, error: mapTableError(error, "inscriptions") };
    }

    const members = (data || [])
      .map((row) => {
        const p = row.membre;
        if (!p?.id) return null;
        const contact = mergeContactFields(p, null);
        return {
          userId: p.id,
          nom: p.last_name || "",
          prenom: p.first_name || "",
          email: p.email || "",
          telephone: contact.telephone,
          ecole: contact.ecole,
          niveau: contact.niveau,
          quantiteHifz: contact.quantiteHifz,
          dateNaissance: null,
          genre: null,
          statutInscription: row.statut,
          dateInscription: row.date_inscription || null,
        };
      })
      .filter(Boolean);

    const userIds = members.map((m) => m.userId);
    const [appsByUser, genreByUser] = await Promise.all([
      fetchLatestMemberApplications(userIds),
      fetchMembresGenreMap(userIds),
    ]);
    const enrichedMembers = members.map((m) => {
      const app = appsByUser[m.userId];
      const merged = mergeContactFields(m, app);
      return {
        ...m,
        telephone: merged.telephone,
        ecole: merged.ecole,
        niveau: merged.niveau,
        quantiteHifz: merged.quantiteHifz,
        genre:
          formatGenderLabel(genreByUser[m.userId] || app?.genre) || null,
      };
    });

    return { ok: true, members: enrichedMembers };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

function pickProfileText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

/** Normalise genre (CdC M/F ou arabe) pour affichage UI. */
export function formatGenderLabel(raw) {
  const text = pickProfileText(raw);
  if (!text) return null;
  const key = text.toLowerCase();
  if (key === "m" || key === "male" || key === "homme" || text === "ذكر") return "ذكر";
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

async function fetchMembreGenre(membreId) {
  const { data, error } = await withTimeout(
    supabase.from("membres").select("genre").eq("user_id", membreId).maybeSingle(),
    SUPABASE_TIMEOUT_MS,
    "قراءة جنس العضو"
  );

  if (error) {
    const msg = error?.message || "";
    if (
      /relation.*does not exist|Could not find the table/i.test(msg) ||
      /permission|row-level security|RLS|42501|violates row/i.test(msg)
    ) {
      return null;
    }
    logSupabaseError("fetchMembreGenre", error);
    return null;
  }

  return formatGenderLabel(data?.genre);
}

async function fetchMembresGenreMap(userIds) {
  if (!userIds?.length) return {};
  const { data, error } = await withTimeout(
    supabase.from("membres").select("user_id, genre").in("user_id", userIds),
    SUPABASE_TIMEOUT_MS,
    "قراءة جنس الأعضاء"
  );
  if (error) {
    const msg = error?.message || "";
    if (
      /relation.*does not exist|Could not find the table/i.test(msg) ||
      /permission|row-level security|RLS|42501|violates row/i.test(msg)
    ) {
      return {};
    }
    logSupabaseError("fetchMembresGenreMap", error);
    return {};
  }
  const map = {};
  for (const row of data || []) {
    if (row.user_id) map[row.user_id] = row.genre;
  }
  return map;
}

function mergeContactFields(primary, fallback) {
  return {
    telephone:
      pickProfileText(primary?.phone ?? primary?.telephone) ||
      pickProfileText(fallback?.phone),
    ecole:
      pickProfileText(primary?.school ?? primary?.ecole) ||
      pickProfileText(fallback?.school),
    niveau:
      pickProfileText(primary?.level ?? primary?.niveau) ||
      pickProfileText(fallback?.level),
    quantiteHifz:
      pickProfileText(primary?.hifz_amount ?? primary?.quantiteHifz) ||
      pickProfileText(fallback?.hifz_amount),
  };
}

async function fetchLatestMemberApplications(userIds) {
  if (!userIds?.length) return {};

  const { data, error } = await withTimeout(
    supabase
      .from("member_applications")
      .select("user_id, phone, school, level, hifz_amount, genre, updated_at")
      .in("user_id", userIds)
      .order("updated_at", { ascending: false }),
    SUPABASE_TIMEOUT_MS,
    "قراءة طلبات الأعضاء"
  );

  if (error) {
    logSupabaseError("fetchLatestMemberApplications", error);
    return {};
  }

  const byUser = {};
  for (const row of data || []) {
    if (!byUser[row.user_id]) byUser[row.user_id] = row;
  }
  return byUser;
}

/**
 * Champs contact / inscription depuis profiles, repli member_applications si vides.
 * Source profiles (décision actée) ; la demande membre peut encore porter phone/school/level/hifz.
 */
export async function getMemberProfileFields(membreId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!membreId) {
    return { ok: false, error: "معرّف العضو مفقود" };
  }

  try {
    let profileData = null;

    const profileRes = await withTimeout(
      supabase
        .from("profiles")
        .select("phone, school, level, hifz_amount")
        .eq("id", membreId)
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة ملف العضو"
    );

    if (!profileRes.error && profileRes.data) {
      profileData = profileRes.data;
    } else if (
      profileRes.error &&
      !/column.*does not exist/i.test(profileRes.error?.message || "")
    ) {
      logSupabaseError("getMemberProfileFields profiles", profileRes.error);
    }

    const appsByUser = await fetchLatestMemberApplications([membreId]);
    const merged = mergeContactFields(profileData, appsByUser[membreId]);
    const genre = await fetchMembreGenre(membreId);

    return {
      ok: true,
      telephone: merged.telephone,
      ecole: merged.ecole,
      niveau: merged.niveau,
      quantiteHifz: merged.quantiteHifz,
      genre,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

function buildEditableProfilePayload(fields = {}) {
  const payload = {};
  if (fields.phone !== undefined) {
    payload.phone = pickProfileText(fields.phone);
  }
  if (fields.school !== undefined) {
    payload.school = pickProfileText(fields.school);
  }
  if (fields.level !== undefined) {
    payload.level = pickProfileText(fields.level);
  }
  if (fields.hifzAmount !== undefined) {
    payload.hifz_amount = pickProfileText(fields.hifzAmount);
  }
  return payload;
}

/**
 * Met à jour les champs contact/inscription d'un membre (profiles uniquement).
 * Colonnes autorisées : phone, school, level, hifz_amount — jamais identité.
 * Sécurité serveur : profiles_update_own (auth.uid() = id) — le superviseur a
 * perdu l'accès en écriture sur profiles (migration 0030), donc seul le membre
 * lui-même peut appeler ceci sur sa propre ligne.
 */
export async function updateMemberInfo(memberId, fields = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!memberId) {
    return { ok: false, error: "معرّف العضو مفقود" };
  }

  const payload = buildEditableProfilePayload(fields);
  if (Object.keys(payload).length === 0) {
    return { ok: false, error: "لا توجد بيانات للتحديث" };
  }

  payload.updated_at = new Date().toISOString();

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .update(payload)
        .eq("id", memberId)
        .select("phone, school, level, hifz_amount")
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "تحديث ملف العضو"
    );

    if (error) {
      logSupabaseError("updateMemberInfo", error);
      return { ok: false, error: mapTableError(error, "profiles") };
    }

    return {
      ok: true,
      telephone: pickProfileText(data?.phone),
      ecole: pickProfileText(data?.school),
      niveau: pickProfileText(data?.level),
      quantiteHifz: pickProfileText(data?.hifz_amount),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * (Admin) Change la séance d'un membre inscrit (statut accepte).
 * Le trigger sync_inscription_saison_id met à jour saison_id automatiquement.
 */
export async function updateMemberSeance({
  memberId,
  currentSeanceId = null,
  newSeanceId,
  saisonId = null,
}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!memberId || !newSeanceId) {
    return { ok: false, error: "معرّف العضو أو الحصة مفقود" };
  }
  if (currentSeanceId && currentSeanceId === newSeanceId) {
    return { ok: true, unchanged: true };
  }

  try {
    let query = supabase
      .from("inscriptions")
      .update({ seance_id: newSeanceId })
      .eq("membre_id", memberId)
      .eq("statut", "accepte");

    if (currentSeanceId) {
      query = query.eq("seance_id", currentSeanceId);
    } else if (saisonId) {
      query = query.eq("saison_id", saisonId);
    }

    const { data, error } = await withTimeout(
      query.select("id, seance_id, saison_id").maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "تغيير حصة العضو"
    );

    if (error) {
      logSupabaseError("updateMemberSeance", error);
      return { ok: false, error: mapTableError(error, "inscriptions") };
    }

    if (!data?.id) {
      return {
        ok: false,
        error: "لم يتم العثور على تسجيل مقبول لهذا العضو",
      };
    }

    return {
      ok: true,
      inscription: data,
      seanceId: data.seance_id,
      saisonId: data.saison_id,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Retire un membre de sa séance : supprime la ligne inscriptions (RG3).
 * Ne touche pas profiles, presences ni progression.
 * Sécurité serveur : inscriptions_delete_superviseur (migration 0027).
 */
export async function removeMemberFromSeance(memberId, seanceId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!memberId || !seanceId) {
    return { ok: false, error: "معرّف العضو أو الحصة مفقود" };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("inscriptions")
        .delete()
        .eq("membre_id", memberId)
        .eq("seance_id", seanceId)
        .eq("statut", "accepte")
        .select("id")
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "إزالة العضو من الحصة"
    );

    if (error) {
      logSupabaseError("removeMemberFromSeance", error);
      return { ok: false, error: mapTableError(error, "inscriptions") };
    }

    if (!data?.id) {
      return {
        ok: false,
        error: "لم يتم العثور على تسجيل مقبول لهذا العضو في هذه الحصة",
      };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
