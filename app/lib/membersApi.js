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
 * dateNaissance / genre / telephone : absents de profiles — retournés null.
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
          "membre_id, statut, date_inscription, membre:profiles!inscriptions_membre_id_fkey(id, first_name, last_name, email)"
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
        return {
          userId: p.id,
          nom: p.last_name || "",
          prenom: p.first_name || "",
          email: p.email || "",
          telephone: null,
          dateNaissance: null,
          genre: null,
          statutInscription: row.statut,
          dateInscription: row.date_inscription || null,
        };
      })
      .filter(Boolean);

    return { ok: true, members };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
