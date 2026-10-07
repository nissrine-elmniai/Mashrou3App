import { supabase, isSupabaseConfigured, mapSupabaseAuthError } from "./supabase";
import {
  REGISTRATION_KIND,
  REGISTRATION_STATUS,
} from "../constants/roles";

const SUPABASE_TIMEOUT_MS = 15000;

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

function mapStatus(status) {
  if (status === REGISTRATION_STATUS.ACCEPTED) return "invited";
  if (status === REGISTRATION_STATUS.INVITED) return "invited";
  if (status === REGISTRATION_STATUS.ACTIVATED) return "activated";
  if (status === REGISTRATION_STATUS.REJECTED) return "rejected";
  return "pending";
}

function mapDbStatusToApp(status) {
  if (status === "invited") return REGISTRATION_STATUS.INVITED;
  if (status === "activated") return REGISTRATION_STATUS.ACTIVATED;
  if (status === "rejected") return REGISTRATION_STATUS.REJECTED;
  return REGISTRATION_STATUS.PENDING;
}

function resolveApplicationKind(row, answers = {}) {
  const raw = String(row?.kind || answers?.kind || "").trim();
  if (raw === REGISTRATION_KIND.SEASON_RENEWAL) {
    return REGISTRATION_KIND.SEASON_RENEWAL;
  }
  if (raw === REGISTRATION_KIND.JOIN) return REGISTRATION_KIND.JOIN;
  // Heuristique legacy : une demande déjà liée à un user sans kind explicite
  if (row?.user_id && row?.status === "pending") {
    return REGISTRATION_KIND.SEASON_RENEWAL;
  }
  return REGISTRATION_KIND.JOIN;
}

/** Mappe une ligne Supabase vers l'objet registration local. */
export function mapMemberApplicationRow(row) {
  if (!row) return null;
  const answers =
    row.form_answers && typeof row.form_answers === "object"
      ? row.form_answers
      : {};
  const kind = resolveApplicationKind(row, answers);
  let status = mapDbStatusToApp(row.status);
  // Renouvellement accepté stocké en « activated » côté DB (pas de nouveau compte)
  if (
    kind === REGISTRATION_KIND.SEASON_RENEWAL &&
    status === REGISTRATION_STATUS.ACTIVATED
  ) {
    status = REGISTRATION_STATUS.ACCEPTED;
  }
  return {
    id: String(row.id),
    kind,
    userId: row.user_id || null,
    seasonId: row.season_id || null,
    fullName: row.full_name || "",
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    school: row.school || "",
    level: row.level || "",
    phone: row.phone || "",
    hifzAmount:
      answers.seasonGoal ||
      row.hifz_amount ||
      "",
    email: row.email || "",
    gender: row.genre || "",
    seanceId: row.seance_id || null,
    seanceName: row.requested_seance_name || "",
    formAnswers: answers,
    freeTimes: Array.isArray(answers.freeTimes) ? answers.freeTimes : [],
    status,
    inviteToken: null,
    createdAt: row.created_at ? String(row.created_at) : "",
    acceptedAt: row.accepted_at ? String(row.accepted_at) : undefined,
  };
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

/**
 * (Admin) Liste des demandes d'intégration depuis Supabase.
 * @returns { ok, applications }
 */
export async function listMemberApplications() {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true, applications: [] };
  }
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("member_applications")
        .select("*")
        .order("created_at", { ascending: false }),
      SUPABASE_TIMEOUT_MS,
      "قراءة طلبات الانضمام"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "member_applications") };
    }
    return {
      ok: true,
      applications: (data || [])
        .map(mapMemberApplicationRow)
        .filter(Boolean),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Dix demandes les plus récentes de la saison, tous statuts et tous kind. */
export async function listRecentMemberApplications(saisonId, limit = 10) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل", applications: [] };
  }
  if (!saisonId) return { ok: true, applications: [] };
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
  try {
    const { data, error } = await withTimeout(
      supabase
        .from("member_applications")
        .select("*")
        .eq("season_id", saisonId)
        .order("created_at", { ascending: false })
        .limit(take),
      SUPABASE_TIMEOUT_MS,
      "قراءة آخر الطلبات"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "member_applications"), applications: [] };
    }
    return {
      ok: true,
      applications: (data || []).map(mapMemberApplicationRow).filter(Boolean),
    };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase", applications: [] };
  }
}

function buildApplicationRow(reg, statusMapped, { now = new Date().toISOString() } = {}) {
  const kind =
    reg.kind === REGISTRATION_KIND.SEASON_RENEWAL
      ? REGISTRATION_KIND.SEASON_RENEWAL
      : REGISTRATION_KIND.JOIN;
  const formAnswers = {
    ...(reg.formAnswers && typeof reg.formAnswers === "object"
      ? reg.formAnswers
      : {}),
    kind,
    ...(Array.isArray(reg.freeTimes) ? { freeTimes: reg.freeTimes } : {}),
  };
  const row = {
    id: String(reg.id),
    email: String(reg.email).trim().toLowerCase(),
    full_name: reg.fullName || null,
    first_name: reg.firstName || null,
    last_name: reg.lastName || null,
    phone: reg.phone || null,
    school: reg.school || null,
    level: reg.level || null,
    hifz_amount:
      reg.hifzAmount ||
      reg.formAnswers?.seasonGoal ||
      null,
    season_id: reg.seasonId || null,
    seance_id: reg.seanceId || null,
    requested_seance_name: reg.seanceName || reg.requestedSeanceName || null,
    genre: reg.gender || reg.genre || null,
    form_answers: formAnswers,
    kind,
    status: statusMapped,
    updated_at: now,
  };
  if (reg.userId) {
    const uidVal = String(reg.userId);
    // profiles / auth.users : uuid uniquement (ignorer les ids locaux u_…)
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        uidVal
      )
    ) {
      row.user_id = uidVal;
    }
  }
  if (statusMapped === "invited" || statusMapped === "activated") {
    row.accepted_at = reg.acceptedAt || now;
  }
  if (statusMapped === "activated") {
    row.activated_at = now;
  }
  if (statusMapped === "rejected") {
    row.rejected_at = now;
  }
  return row;
}

async function insertApplicationRow(row, label) {
  // Pas de .select() : le rôle anon n'a souvent que INSERT (pas SELECT).
  let attempt = row;
  let { error } = await withTimeout(
    supabase.from("member_applications").insert(attempt),
    SUPABASE_TIMEOUT_MS,
    label
  );

  // Bases sans colonne kind (migration 0060 non exécutée)
  if (error && /kind|column.*does not exist/i.test(error?.message || "")) {
    const { kind: _k, ...rest } = attempt;
    attempt = rest;
    ({ error } = await withTimeout(
      supabase.from("member_applications").insert(attempt),
      SUPABASE_TIMEOUT_MS,
      label
    ));
  }

  // Bases sans colonne form_answers (migration 0048 non exécutée)
  if (error && /form_answers|column.*does not exist/i.test(error?.message || "")) {
    const { form_answers: _fa, ...rest } = attempt;
    attempt = rest;
    ({ error } = await withTimeout(
      supabase.from("member_applications").insert(attempt),
      SUPABASE_TIMEOUT_MS,
      label
    ));
  }

  return error;
}

/**
 * Réinscription ouverte (pending / activated) pour ce compte et cette saison.
 * Depuis 0111 l'email enregistré est celui du JWT : on cherche par user_id.
 * `email` reste accepté pour les appelants, il n'entre plus dans la requête.
 */
export async function findOpenSeasonRenewal({ seasonId, userId = null }) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true, application: null };
  }
  const uid = String(userId || "").trim();
  const season = String(seasonId || "").trim();
  if (!uid || !season) {
    return { ok: false, error: "بيانات البحث غير مكتملة" };
  }

  try {
    let query = supabase
      .from("member_applications")
      .select("*")
      .eq("user_id", uid)
      .eq("season_id", season)
      .neq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(5);

    // kind peut manquer si 0060 non appliquée — on filtre côté JS aussi
    const { data, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "التحقق من طلب إعادة التسجيل"
    );

    if (error) {
      return { ok: false, error: mapTableError(error, "member_applications") };
    }

    const rows = (data || [])
      .map(mapMemberApplicationRow)
      .filter(Boolean)
      .filter((r) => {
        if (getRegistrationKindSafe(r) !== REGISTRATION_KIND.SEASON_RENEWAL) {
          return false;
        }
        if (r.status === REGISTRATION_STATUS.REJECTED) return false;
        return true;
      });

    return { ok: true, application: rows[0] || null };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/**
 * Dernière demande du compte pour chaque saison, plus l'inscription acceptée
 * encore rattachée à une séance non archivée.
 * mode : review | accepted | waiting | form
 */
export async function fetchMySeasonRegistrationView(userId, seasonIds) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true, bySeason: {} };
  }
  const uid = String(userId || "").trim();
  const ids = [
    ...new Set((seasonIds || []).map((id) => String(id || "")).filter(Boolean)),
  ];
  if (!uid || ids.length === 0) {
    return { ok: true, bySeason: {} };
  }

  try {
    const [appsRes, inscRes] = await Promise.all([
      withTimeout(
        supabase
          .from("member_applications")
          .select("id, season_id, status, created_at")
          .eq("user_id", uid)
          .in("season_id", ids)
          .order("created_at", { ascending: false }),
        SUPABASE_TIMEOUT_MS,
        "قراءة طلبات التسجيل"
      ),
      withTimeout(
        supabase
          .from("inscriptions")
          .select(
            "id, saison_id, statut, seance:seances!inscriptions_seance_id_fkey(nom, statut)"
          )
          .eq("membre_id", uid)
          .eq("statut", "accepte")
          .in("saison_id", ids),
        SUPABASE_TIMEOUT_MS,
        "قراءة تسجيل الحصة"
      ),
    ]);

    if (appsRes.error) {
      return {
        ok: false,
        error: mapTableError(appsRes.error, "member_applications"),
        bySeason: {},
      };
    }
    if (inscRes.error) {
      return {
        ok: false,
        error: mapTableError(inscRes.error, "inscriptions"),
        bySeason: {},
      };
    }

    const bySeason = {};
    const seen = new Set();
    for (const row of appsRes.data || []) {
      const sid = String(row.season_id || "");
      if (!sid || seen.has(sid)) continue;
      seen.add(sid);
      if (row.status === "pending" || row.status === "invited") {
        bySeason[sid] = { mode: "review" };
        continue;
      }
      if (row.status === "activated") {
        const live = (inscRes.data || []).find(
          (item) =>
            String(item.saison_id || "") === sid &&
            item.seance?.statut &&
            item.seance.statut !== "archivee"
        );
        bySeason[sid] = live?.seance?.nom
          ? { mode: "accepted", seanceName: live.seance.nom }
          : { mode: "waiting" };
        continue;
      }
      if (row.status === "rejected") {
        bySeason[sid] = { mode: "form", rejected: true };
      }
    }
    return { ok: true, bySeason };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
      bySeason: {},
    };
  }
}

/** Soumission d'une demande en attente (intégration ou réinscription saison) */
export async function insertPendingMemberApplication(reg) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }
  if (!reg?.id || !reg?.email) {
    return { ok: false, error: "بيانات الطلب غير مكتملة" };
  }

  const now = new Date().toISOString();
  const row = {
    ...buildApplicationRow(reg, "pending", { now }),
    created_at: now,
  };

  try {
    const error = await insertApplicationRow(row, "إرسال طلب التسجيل");
    if (error) {
      const msg = error.message || "";
      const taken = msg.match(
        /هذا البريد مستعمل من طرف حساب مشرف|هذا البريد مرتبط بدعوة مشرف/
      );
      if (taken) {
        return { ok: false, error: taken[0] };
      }
      if (/duplicate key|23505/i.test(msg)) {
        const isRenewal =
          getRegistrationKindSafe(reg) === REGISTRATION_KIND.SEASON_RENEWAL;
        return {
          ok: false,
          error: isRenewal
            ? "لديك طلب إعادة تسجيل مسبقاً لهذا الموسم"
            : "لديك طلب قيد المراجعة بالفعل لهذا الموسم",
        };
      }
      if (/relation.*does not exist|Could not find the table/i.test(msg)) {
        return {
          ok: false,
          error:
            "جدول member_applications غير موجود — نفّذ ملفات supabase/migrations/ في SQL Editor",
        };
      }
      if (/permission denied|42501/i.test(msg)) {
        return {
          ok: false,
          error:
            "لا صلاحية لإرسال الطلب — نفّذ supabase/migrations/0049_member_applications_anon_insert.sql في SQL Editor",
        };
      }
      return { ok: false, error: mapSupabaseAuthError(error) };
    }
    return { ok: true, application: null };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}

/** Upsert d'une demande après validation / rejet admin */
export async function upsertMemberApplication(reg, status) {
  if (!isSupabaseConfigured()) {
    return { ok: true, skipped: true };
  }
  if (!reg?.id || !reg?.email) {
    return { ok: false, error: "بيانات الطلب غير مكتملة" };
  }

  const isRenewal =
    getRegistrationKindSafe(reg) === REGISTRATION_KIND.SEASON_RENEWAL;
  // Renouvellement accepté → activated (compte déjà existant) pour déclencher
  // sync_profile_from_member_application (hifz / séance).
  let mapped = mapStatus(status);
  if (
    isRenewal &&
    (status === REGISTRATION_STATUS.ACCEPTED ||
      status === REGISTRATION_STATUS.ACTIVATED)
  ) {
    mapped = "activated";
  }

  const now = new Date().toISOString();
  const row = buildApplicationRow(
    {
      ...reg,
      kind: isRenewal
        ? REGISTRATION_KIND.SEASON_RENEWAL
        : REGISTRATION_KIND.JOIN,
    },
    mapped,
    { now }
  );

  try {
    let attempt = row;
    let { data, error } = await withTimeout(
      supabase
        .from("member_applications")
        .upsert(attempt, { onConflict: "id" })
        .select("*")
        .single(),
      SUPABASE_TIMEOUT_MS,
      "حفظ الطلب في Supabase"
    );

    if (error && /kind|column.*does not exist/i.test(error?.message || "")) {
      const { kind: _k, ...rest } = attempt;
      attempt = rest;
      ({ data, error } = await withTimeout(
        supabase
          .from("member_applications")
          .upsert(attempt, { onConflict: "id" })
          .select("*")
          .single(),
        SUPABASE_TIMEOUT_MS,
        "حفظ الطلب في Supabase"
      ));
    }

    if (error && /form_answers|column.*does not exist/i.test(error?.message || "")) {
      const { form_answers: _fa, ...rest } = attempt;
      attempt = rest;
      ({ data, error } = await withTimeout(
        supabase
          .from("member_applications")
          .upsert(attempt, { onConflict: "id" })
          .select("*")
          .single(),
        SUPABASE_TIMEOUT_MS,
        "حفظ الطلب في Supabase"
      ));
    }

    if (error) {
      const msg = error.message || "";
      if (/relation.*does not exist|Could not find the table/i.test(msg)) {
        return {
          ok: false,
          error:
            "جدول member_applications غير موجود — نفّذ ملف supabase/member_applications.sql في SQL Editor",
        };
      }
      if (/permission|row-level security|RLS|42501/i.test(msg)) {
        return {
          ok: false,
          error: "لا صلاحية للكتابة — سجّل دخول الأدمن عبر Supabase ثم أعد المحاولة",
        };
      }
      return { ok: false, error: mapSupabaseAuthError(error) };
    }
    return { ok: true, application: data };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || "تعذر الاتصال بـ Supabase",
    };
  }
}

function getRegistrationKindSafe(reg) {
  if (reg?.kind === REGISTRATION_KIND.SEASON_RENEWAL) {
    return REGISTRATION_KIND.SEASON_RENEWAL;
  }
  if (reg?.kind === REGISTRATION_KIND.JOIN) return REGISTRATION_KIND.JOIN;
  if (reg?.userId) return REGISTRATION_KIND.SEASON_RENEWAL;
  return REGISTRATION_KIND.JOIN;
}

/**
 * (Admin) Demandes pending. saisonId limite à la saison affichée.
 * Sans saisonId : toutes les saisons (appel historique).
 * @returns { ok, count }
 */
export async function countPendingApplications(saisonId = null) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase غير مفعّل" };
  }
  try {
    let query = supabase
      .from("member_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (saisonId) query = query.eq("season_id", saisonId);
    const { count, error } = await withTimeout(
      query,
      SUPABASE_TIMEOUT_MS,
      "قراءة الطلبات المعلقة"
    );
    if (error) {
      return { ok: false, error: mapTableError(error, "member_applications") };
    }
    return { ok: true, count: count || 0 };
  } catch (e) {
    return { ok: false, error: e?.message || "تعذر الاتصال بـ Supabase" };
  }
}
