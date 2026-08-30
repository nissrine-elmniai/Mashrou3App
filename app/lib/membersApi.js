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

/**
 * Séance active du superviseur connecté (auth user id = profiles.id).
 * RLS : seances_select_own (superviseur_id = auth.uid()).
 * @param {string} supervisorAuthId UUID du profil superviseur
 * @returns {{ ok: boolean, seance?: object|null, error?: string }}
 */
export async function getSupervisorActiveSeance(supervisorAuthId) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", seance: null };
  }
  if (!supervisorAuthId) {
    return { ok: false, error: "معرّف المشرف مفقود", seance: null };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("seances")
        .select("*")
        .eq("superviseur_id", supervisorAuthId)
        .eq("statut", "active")
        .maybeSingle(),
      SUPABASE_TIMEOUT_MS,
      "قراءة الحصة النشطة"
    );
    if (error) {
      logSupabaseError("getSupervisorActiveSeance", error);
      return { ok: false, error: mapTableError(error, "seances"), seance: null };
    }
    return { ok: true, seance: data || null };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      seance: null,
    };
  }
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

    const appsByUser = await fetchLatestMemberApplications(members.map((m) => m.userId));
    const enrichedMembers = members.map((m) => {
      const merged = mergeContactFields(m, appsByUser[m.userId]);
      return {
        ...m,
        telephone: merged.telephone,
        ecole: merged.ecole,
        niveau: merged.niveau,
        quantiteHifz: merged.quantiteHifz,
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
      .select("user_id, phone, school, level, hifz_amount, updated_at")
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
