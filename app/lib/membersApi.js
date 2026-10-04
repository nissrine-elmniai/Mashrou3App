import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import { resolvePublicAvatarUrl } from "./avatarApi";
import { sortSeancesByJour } from "./seancesApi";
import { fetchSeasonDirectory } from "./saisonsApi";

const SUPABASE_TIMEOUT_MS = 15000;

/** UUID Postgres — les ids mock (`u_123`) ne doivent jamais être envoyés en filtre. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(id) {
  return typeof id === "string" && UUID_RE.test(id);
}

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
  if (!isUuid(supervisorAuthId)) {
    return { ok: false, error: "معرّف المشرف غير صالح", seances: [] };
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
 * dateNaissance : non lue ici. Genre : profiles.genre, sinon member_applications.genre.
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
  if (!isUuid(seanceId)) {
    return { ok: false, error: "معرّف الحصة غير صالح" };
  }

  try {
    const selectMembers = (withAvatar) =>
      withTimeout(
        supabase
          .from("inscriptions")
          .select(
            `membre_id, statut, date_inscription, membre:profiles!inscriptions_membre_id_fkey(id, first_name, last_name, email, phone, school, level, hifz_amount, genre${
              withAvatar ? ", avatar_url" : ""
            })`
          )
          .eq("seance_id", seanceId)
          .eq("statut", "accepte")
          .order("date_inscription", { ascending: false, nullsFirst: false })
          .order("membre_id", { ascending: false }),
        SUPABASE_TIMEOUT_MS,
        "قراءة أعضاء الحصة"
      );

    let { data, error } = await selectMembers(true);
    // Base sans migration 0047 : on relit sans la colonne avatar_url.
    if (error && /column.*avatar_url|avatar_url.*does not exist/i.test(error.message || "")) {
      ({ data, error } = await selectMembers(false));
    }
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
          avatarUrl: resolvePublicAvatarUrl(p.id, p.avatar_url),
          telephone: contact.telephone,
          ecole: contact.ecole,
          niveau: contact.niveau,
          quantiteHifz: contact.quantiteHifz,
          dateNaissance: null,
          genre: formatGenderLabel(p.genre),
          statutInscription: row.statut,
          dateInscription: row.date_inscription || null,
        };
      })
      .filter(Boolean);

    const userIds = members.map((m) => m.userId);
    const appsByUser = await fetchLatestMemberApplications(userIds);
    const enrichedMembers = members.map((m) => {
      const app = appsByUser[m.userId];
      const merged = mergeContactFields(m, app);
      return {
        ...m,
        telephone: merged.telephone,
        ecole: merged.ecole,
        niveau: merged.niveau,
        quantiteHifz: merged.quantiteHifz,
        genre: m.genre || formatGenderLabel(app?.genre) || null,
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

    const readProfile = (columns) =>
      withTimeout(
        supabase.from("profiles").select(columns).eq("id", membreId).maybeSingle(),
        SUPABASE_TIMEOUT_MS,
        "قراءة ملف العضو"
      );

    // Colonnes profiles : identité + contact (genre 0052, date_naissance 0056).
    let profileRes = await readProfile(
      "first_name, last_name, email, date_naissance, phone, school, level, hifz_amount, genre, avatar_url"
    );
    if (
      profileRes.error &&
      /column.*does not exist/i.test(profileRes.error?.message || "")
    ) {
      profileRes = await readProfile(
        "first_name, last_name, email, phone, school, level, hifz_amount, genre, avatar_url"
      );
    }
    if (
      profileRes.error &&
      /column.*does not exist/i.test(profileRes.error?.message || "")
    ) {
      profileRes = await readProfile("email, phone, school, level, hifz_amount");
    }

    if (!profileRes.error && profileRes.data) {
      profileData = profileRes.data;
    } else if (
      profileRes.error &&
      !/column.*does not exist/i.test(profileRes.error?.message || "")
    ) {
      logSupabaseError("getMemberProfileFields profiles", profileRes.error);
    }

    const appsByUser = await fetchLatestMemberApplications([membreId]);
    const application = appsByUser[membreId];
    const merged = mergeContactFields(profileData, application);

    const genre =
      formatGenderLabel(profileData?.genre) ||
      formatGenderLabel(application?.genre) ||
      null;

    return {
      ok: true,
      firstName: pickProfileText(profileData?.first_name),
      lastName: pickProfileText(profileData?.last_name),
      email: pickProfileText(profileData?.email),
      dateNaissance: profileData?.date_naissance || null,
      telephone: merged.telephone,
      ecole: merged.ecole,
      niveau: merged.niveau,
      quantiteHifz: merged.quantiteHifz,
      genre,
      profileMissing: !profileRes.error && !profileRes.data,
      avatarUrl: resolvePublicAvatarUrl(membreId, profileData?.avatar_url),
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
 * Mise à jour des infos personnelles par le membre connecté.
 * Un seul UPDATE : first_name, last_name, phone, genre, date_naissance, school, level.
 * Jamais email, canonical_email, hifz_amount, role, roles, account_status.
 */
export async function updatePersonalInfo(userId, fields = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "تعذّر حفظ المعلومات" };
  }
  if (!userId) {
    return { ok: false, error: "تعذّر حفظ المعلومات" };
  }

  const firstName = pickProfileText(fields.firstName);
  const lastName = pickProfileText(fields.lastName);
  const phone = pickProfileText(fields.phone);
  const genre = fields.genre === "ذكر" || fields.genre === "أنثى" ? fields.genre : null;
  const dateNaissance = pickProfileText(fields.dateNaissance);
  if (!firstName || !lastName || !phone || !genre || !dateNaissance) {
    return { ok: false, error: "تعذّر حفظ المعلومات" };
  }

  const payload = {
    first_name: firstName,
    last_name: lastName,
    phone,
    genre,
    date_naissance: dateNaissance,
    school: pickProfileText(fields.school),
    level: pickProfileText(fields.level),
  };

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .update(payload)
        .eq("id", userId)
        .select("first_name, last_name, phone, genre, date_naissance, school, level")
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "تحديث المعلومات الشخصية"
    );

    if (error || !data) {
      if (error) logSupabaseError("updatePersonalInfo", error);
      return { ok: false, error: "تعذّر حفظ المعلومات" };
    }

    return {
      ok: true,
      firstName: pickProfileText(data.first_name),
      lastName: pickProfileText(data.last_name),
      phone: pickProfileText(data.phone),
      genre: formatGenderLabel(data.genre),
      dateNaissance: data.date_naissance || null,
      school: pickProfileText(data.school),
      level: pickProfileText(data.level),
    };
  } catch {
    return { ok: false, error: "تعذّر حفظ المعلومات" };
  }
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
 * Écriture sur inscriptions : le trigger sync_inscription_saison_id copie
 * seances.saison_id (texte « s_… ») dans inscriptions.saison_id ; si cette
 * colonne est encore en uuid côté serveur, Postgres renvoie 22P02.
 */
function mapInscriptionWriteError(error) {
  const msg = error?.message || "";
  if (error?.code === "22P02" && /uuid/i.test(msg)) {
    return "قاعدة البيانات غير محدّثة: عمود inscriptions.saison_id من نوع uuid — نفّذ supabase/migrations/0053_inscriptions_saison_id_text.sql في SQL Editor";
  }
  return mapTableError(error, "inscriptions");
}

/**
 * (Admin) Change la séance d'un membre (statut accepte).
 * - `saisonId` = musim de la séance cible : si le membre y a déjà une
 *   inscription acceptée, elle est déplacée ; sinon, avec `createIfMissing`,
 *   une nouvelle inscription est créée (les inscriptions des anciens musims
 *   ne sont jamais touchées).
 * - Sans saisonId (séance legacy), on déplace l'inscription de `currentSeanceId`.
 * Le trigger sync_inscription_saison_id met à jour saison_id automatiquement.
 */
export async function updateMemberSeance({
  memberId,
  currentSeanceId = null,
  newSeanceId,
  saisonId = null,
  createIfMissing = false,
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
    // Pas de filtre SQL sur inscriptions.saison_id : sur certaines bases la
    // colonne est uuid (schéma historique) alors que les ids de musim sont du
    // texte (s_…), et elle est souvent null. On passe par la séance jointe.
    const { data: rows, error: existingError } = await withTimeout(
      supabase
        .from("inscriptions")
        .select(
          "id, seance_id, saison_id, seance:seances!inscriptions_seance_id_fkey(id, saison_id)"
        )
        .eq("membre_id", memberId)
        .eq("statut", "accepte"),
      SUPABASE_TIMEOUT_MS,
      "قراءة تسجيل العضو"
    );
    if (existingError) {
      logSupabaseError("updateMemberSeance lookup", existingError);
      return { ok: false, error: mapTableError(existingError, "inscriptions") };
    }

    const seasonOf = (r) => r?.saison_id || r?.seance?.saison_id || null;
    const all = rows || [];
    const existing = saisonId
      ? all.find((r) => seasonOf(r) === saisonId) || null
      : all.find((r) => currentSeanceId && r.seance_id === currentSeanceId) || null;

    if (existing?.id) {
      if (existing.seance_id === newSeanceId) {
        return {
          ok: true,
          unchanged: true,
          inscription: existing,
          seanceId: existing.seance_id,
          saisonId: seasonOf(existing),
        };
      }
      const { data, error } = await withTimeout(
        supabase
          .from("inscriptions")
          .update({ seance_id: newSeanceId, date_inscription: new Date().toISOString() })
          .eq("id", existing.id)
          .select("id, seance_id, saison_id")
          .maybeSingle(),
        SUPABASE_TIMEOUT_MS,
        "تغيير حصة العضو"
      );
      if (error) {
        logSupabaseError("updateMemberSeance", error);
        return { ok: false, error: mapInscriptionWriteError(error) };
      }
      if (!data?.id) {
        return { ok: false, error: "لم يتم العثور على تسجيل مقبول لهذا العضو" };
      }
      return {
        ok: true,
        inscription: data,
        seanceId: data.seance_id,
        saisonId: data.saison_id || saisonId || null,
      };
    }

    if (!createIfMissing) {
      return { ok: false, error: "لم يتم العثور على تسجيل مقبول لهذا العضو" };
    }

    const { data, error } = await withTimeout(
      supabase
        .from("inscriptions")
        .insert({
          membre_id: memberId,
          seance_id: newSeanceId,
          statut: "accepte",
        })
        .select("id, seance_id, saison_id")
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "تسجيل العضو في الحصة"
    );
    if (error) {
      logSupabaseError("updateMemberSeance insert", error);
      return { ok: false, error: mapInscriptionWriteError(error) };
    }
    if (!data?.id) {
      return { ok: false, error: "تعذر إنشاء تسجيل العضو" };
    }
    return {
      ok: true,
      created: true,
      inscription: data,
      seanceId: data.seance_id,
      saisonId: data.saison_id || saisonId || null,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

const REMOVE_NONE = "تعذّر إزالة العضو من الحصة";

/**
 * Inscription de la saison active sur une séance non archivée.
 * saison_id est comparé en texte.
 */
export function isCurrentSeanceInscription(row, seasonId) {
  if (!row || seasonId == null || String(seasonId) === "") return false;
  const sid = String(row.saison_id || row.seance?.saison_id || "");
  if (sid !== String(seasonId)) return false;
  const statut = row.seance?.statut;
  return !!statut && statut !== "archivee";
}

/**
 * Inscription acceptée dans une des saisons actives.
 * archivedOnly : séance archivée. Sinon : séance présente et non archivée.
 */
export function isAcceptedInActiveSeason(row, activeSeasonIds, { archivedOnly = false } = {}) {
  if (!row) return false;
  const ids =
    activeSeasonIds instanceof Set
      ? activeSeasonIds
      : new Set((activeSeasonIds || []).map((id) => String(id)));
  const sid = String(row.saison_id || row.seance?.saison_id || "");
  if (!ids.has(sid)) return false;
  const statut = row.seance?.statut;
  if (!statut) return false;
  if (archivedOnly) return statut === "archivee";
  return statut !== "archivee";
}

const CURRENT_INSCRIPTION_SELECT =
  "id, membre_id, seance_id, saison_id, date_inscription, statut, seance:seances!inscriptions_seance_id_fkey(id, nom, statut, saison_id, jour, heure_debut, heure_fin, superviseur_id, superviseur:profiles!seances_superviseur_id_fkey(id, first_name, last_name, email, canonical_email))";

/**
 * Inscrit = au moins une inscription 'accepte' dont saison_id est une saison
 * active, quel que soit le type. season renvoyée = celle de cette inscription.
 * @returns {{ ok, enrolled?, inscription?, season?, error? }}
 */
export async function getMemberActiveEnrollment(memberId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", enrolled: false };
  }
  if (!memberId) {
    return { ok: false, error: "معرّف العضو مفقود", enrolled: false };
  }
  try {
    const seasonRes = await fetchSeasonDirectory();
    if (!seasonRes.ok) return { ok: false, error: seasonRes.error, enrolled: false };
    const activeSeasons = (seasonRes.seasons || []).filter((season) => season.active);
    if (activeSeasons.length === 0) {
      return { ok: true, enrolled: false, inscription: null, season: null };
    }
    const activeIds = new Set(activeSeasons.map((season) => String(season.id)));

    const { data, error } = await withTimeout(
      supabase
        .from("inscriptions")
        .select(CURRENT_INSCRIPTION_SELECT)
        .eq("membre_id", memberId)
        .eq("statut", "accepte"),
      SUPABASE_TIMEOUT_MS,
      "قراءة حصة العضو"
    );
    if (error) {
      logSupabaseError("getMemberActiveEnrollment", error);
      return { ok: false, error: mapTableError(error, "inscriptions"), enrolled: false };
    }

    const inscription =
      (data || [])
        .filter((row) => activeIds.has(String(row.saison_id || "")))
        .sort(
          (a, b) =>
            new Date(b.date_inscription || 0).getTime() -
            new Date(a.date_inscription || 0).getTime()
        )[0] || null;

    const season = inscription
      ? activeSeasons.find(
          (item) => String(item.id) === String(inscription.saison_id || "")
        ) || null
      : null;

    return { ok: true, enrolled: !!inscription, inscription, season };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      enrolled: false,
    };
  }
}

/** Même règle que getMemberActiveEnrollment, pour le membre connecté. */
export async function getMyActiveEnrollment() {
  const { data } = await supabase.auth.getUser();
  const memberId = data?.user?.id || null;
  if (!memberId) {
    return { ok: false, error: "يجب تسجيل الدخول", enrolled: false };
  }
  return getMemberActiveEnrollment(memberId);
}

/**
 * Séance actuelle : inscription acceptée dans une saison active (tout type).
 * Plus de préférence pour le type regular.
 */
export async function loadCurrentMemberSeance(memberId) {
  const res = await getMemberActiveEnrollment(memberId);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, season: res.season, inscription: res.inscription };
}

/**
 * Demandes activées de la saison active (une requête, filtre season_id en texte).
 */
export async function fetchActivatedMemberIdsForSeason(seasonIdOrIds) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", ids: [] };
  }
  const wanted = new Set(
    (Array.isArray(seasonIdOrIds) ? seasonIdOrIds : [seasonIdOrIds])
      .map((id) => (id == null ? "" : String(id)))
      .filter((id) => id !== "")
  );
  if (wanted.size === 0) {
    return { ok: true, ids: [] };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("member_applications")
        .select("user_id, season_id, status")
        .eq("status", "activated"),
      SUPABASE_TIMEOUT_MS,
      "قراءة الطلبات المفعّلة"
    );
    if (error) {
      logSupabaseError("fetchActivatedMemberIdsForSeason", error);
      return {
        ok: false,
        error: mapTableError(error, "member_applications"),
        ids: [],
      };
    }
    const seen = new Set();
    const ids = [];
    for (const row of data || []) {
      if (!wanted.has(String(row.season_id ?? "")) || !row.user_id) continue;
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      ids.push(row.user_id);
    }
    return { ok: true, ids };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", ids: [] };
  }
}

/**
 * Saison dans laquelle l'admin peut affecter une séance.
 * Inscription acceptée d'une saison active (séance vivante ou archivée),
 * sinon demande activated d'une saison active.
 */
export async function findAdminSeanceAssignmentSeason(memberId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", seasonId: null };
  }
  if (!memberId) {
    return { ok: false, error: "معرّف العضو مفقود", seasonId: null };
  }
  try {
    const seasonRes = await fetchSeasonDirectory();
    if (!seasonRes.ok) {
      return { ok: false, error: seasonRes.error, seasonId: null };
    }
    const active = (seasonRes.seasons || []).filter((season) => season.active);
    if (active.length === 0) {
      return { ok: true, seasonId: null, message: "لا يوجد موسم نشط" };
    }
    const activeIds = new Set(active.map((season) => String(season.id)));

    const enroll = await getMemberActiveEnrollment(memberId);
    if (!enroll.ok) {
      return { ok: false, error: enroll.error, seasonId: null };
    }
    const enrolledSeasonId = enroll.season?.id ? String(enroll.season.id) : "";
    if (enrolledSeasonId && activeIds.has(enrolledSeasonId)) {
      return { ok: true, seasonId: enrolledSeasonId, message: null };
    }

    const { data, error } = await withTimeout(
      supabase
        .from("member_applications")
        .select("season_id, updated_at, created_at")
        .eq("user_id", memberId)
        .eq("status", "activated"),
      SUPABASE_TIMEOUT_MS,
      "قراءة طلب العضو"
    );
    if (error) {
      logSupabaseError("findAdminSeanceAssignmentSeason", error);
      return {
        ok: false,
        error: mapTableError(error, "member_applications"),
        seasonId: null,
      };
    }
    const match = (data || [])
      .filter((row) => activeIds.has(String(row.season_id || "")))
      .sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || 0).getTime();
        const tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      })[0];
    if (match?.season_id) {
      return { ok: true, seasonId: String(match.season_id), message: null };
    }
    return { ok: true, seasonId: null, message: "لا يوجد طلب تسجيل مقبول" };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      seasonId: null,
    };
  }
}

/**
 * Retire un membre de sa séance en supprimant la ligne inscriptions par son id.
 * 0 ligne supprimée (RLS ou id inconnu) → erreur explicite.
 * Ne touche pas profiles, presences ni progression.
 */
export async function removeMemberFromSeance(inscriptionId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  if (!inscriptionId) {
    return { ok: false, error: REMOVE_NONE };
  }

  try {
    const { data, error } = await withTimeout(
      supabase.from("inscriptions").delete().eq("id", inscriptionId).select("id"),
      SUPABASE_TIMEOUT_MS,
      "إزالة العضو من الحصة"
    );

    if (error) {
      logSupabaseError("removeMemberFromSeance", error);
      return { ok: false, error: mapTableError(error, "inscriptions") };
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      return { ok: false, error: REMOVE_NONE };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
