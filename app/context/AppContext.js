import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { DEMO_PASSWORD, emptyState, bootstrapUsers, bootstrapSeasons } from "../data/seed";
import { loadAppState, saveAppState, clearAppState } from "../data/storage";
import {
  ACCOUNT_STATUS,
  DASHBOARD_BY_ROLE,
  REGISTRATION_KIND,
  REGISTRATION_STATUS,
  ROLES,
  SEASON_TYPES,
  getRegistrationKind,
  normalizeRoles,
  resolveSessionRole,
  userHasRole,
  withMergedRoles,
} from "../constants/roles";
import { colors } from "../constants/theme";
import {
  isSupabaseConfigured,
  signInWithEmailPassword,
  signUpWithProfile,
  signOutAuth,
  requestPasswordReset,
  confirmPasswordResetWithOtp,
  getCurrentAuthSession,
  fetchProfile,
  profileToAppUser,
  normalizeAppRole,
} from "../lib/auth";
import {
  upsertMemberApplication,
  insertPendingMemberApplication,
  markMemberApplicationActivated,
} from "../lib/memberApplicationsApi";
import { updateMemberInfo } from "../lib/membersApi";
import { sendAlert } from "../lib/alertsApi";
import { archiveSeancesForSaisonIds } from "../lib/seancesApi";
import {
  closeRegularSaisons,
  syncSeasonsWithSupabase,
  upsertSaison,
} from "../lib/saisonsApi";
import { getActiveRegularSeason } from "../lib/seasonScope";

const AppContext = createContext(null);

const uid = (prefix) =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "/");
}

function inviteToken() {
  return `INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Union des rôles Supabase (profiles.role) et mock locaux pour le routing multi-rôle. */
function mergeRolesForRouting(profile, local) {
  const merged = new Set();
  const profileRole = normalizeAppRole(profile?.role);
  if (profileRole) merged.add(profileRole);
  if (local) {
    normalizeRoles(local).forEach((r) => {
      const n = normalizeAppRole(r);
      if (n) merged.add(n);
    });
  }
  if (merged.size === 0) merged.add(ROLES.MEMBER);
  return [...merged];
}

/** Applique le rôle de routing (session) sur un utilisateur issu du profil Supabase. */
function applySupabaseSessionRole(appUser, profile, local, preferredRole) {
  const profileRole = normalizeAppRole(profile?.role) || ROLES.MEMBER;
  const rolesForRouting = mergeRolesForRouting(profile, local);
  const sessionRole = resolveSessionRole(
    { ...appUser, roles: rolesForRouting },
    preferredRole
  );
  return {
    ...appUser,
    role: sessionRole,
    roles: rolesForRouting,
  };
}

function maybeRefreshSupervisorPushRegistration(userId, role) {
  if (role !== ROLES.SUPERVISOR || !userId) return;
  import("../lib/pushNotifications")
    .then(({ refreshPushRegistrationIfEnabled }) =>
      refreshPushRegistrationIfEnabled(userId)
    )
    .catch((e) => {
      console.warn(
        "[push] maybeRefreshSupervisorPushRegistration:",
        e?.message || e
      );
    });
}

export function AppProvider({ children }) {
  const [hydrated, setHydrated] = useState(false);
  const [users, setUsers] = useState(emptyState.users);
  const [seasons, setSeasons] = useState(emptyState.seasons);
  const [registrations, setRegistrations] = useState(emptyState.registrations);
  const [groups, setGroups] = useState(emptyState.groups);
  const [progress, setProgress] = useState(emptyState.progress);
  const [attendance, setAttendance] = useState(emptyState.attendance);
  const [exams, setExams] = useState(emptyState.exams);
  const [notifications, setNotifications] = useState(emptyState.notifications);
  const [memberPrograms, setMemberPrograms] = useState(
    emptyState.memberPrograms || []
  );
  const [currentUser, setCurrentUser] = useState(null);
  /** Session Supabase Auth, alimentée en best-effort par login() quand le compte est
   *  aussi seedé côté Supabase. null tant qu'aucun lien n'a réussi — ne conditionne
   *  jamais le login mock existant. */
  const [supabaseSession, setSupabaseSession] = useState(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    (async () => {
      const saved = await loadAppState();
      let loadedUsers = bootstrapUsers;
      let loadedSeasons = bootstrapSeasons;
      if (saved) {
        loadedUsers =
          Array.isArray(saved.users) && saved.users.length > 0
            ? saved.users
            : bootstrapUsers;
        loadedSeasons =
          Array.isArray(saved.seasons) && saved.seasons.length > 0
            ? saved.seasons
            : bootstrapSeasons;
        setUsers(loadedUsers);
        setSeasons(loadedSeasons);
        setRegistrations(saved.registrations || []);
        setGroups(saved.groups || []);
        setProgress(saved.progress || []);
        setAttendance(saved.attendance || []);
        setExams(saved.exams || []);
        setNotifications(saved.notifications || []);
        setMemberPrograms(saved.memberPrograms || emptyState.memberPrograms || []);
      } else {
        setUsers(loadedUsers);
        setSeasons(loadedSeasons);
      }

      if (isSupabaseConfigured()) {
        const seasonSync = await syncSeasonsWithSupabase(loadedSeasons);
        if (seasonSync.ok && seasonSync.seasons) {
          setSeasons(seasonSync.seasons);
        }
      }

      let restored = null;
      if (isSupabaseConfigured()) {
        const sessionResult = await getCurrentAuthSession();
        if (sessionResult.session?.user) {
          const profileResult = await fetchProfile(sessionResult.session.user.id);
          if (profileResult.ok) {
            const mail = profileResult.profile.email?.toLowerCase();
            const local =
              loadedUsers.find((u) => u.email?.toLowerCase() === mail) ||
              loadedUsers.find((u) => u.authId === profileResult.profile.id);
            const restoredBase = profileToAppUser(
              profileResult.profile,
              local || {}
            );
            if (local) restoredBase.id = local.id;
            restored = applySupabaseSessionRole(
              restoredBase,
              profileResult.profile,
              local,
              null
            );
            setSupabaseSession(sessionResult.session);
            maybeRefreshSupervisorPushRegistration(
              profileResult.profile.id,
              restored.role
            );
          }
        }
      } else if (saved?.currentUserId) {
        restored = loadedUsers.find((u) => u.id === saved.currentUserId) || null;
      }

      if (restored) setCurrentUser(restored);
      skipNextSave.current = true;
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    saveAppState({
      users,
      seasons,
      registrations,
      groups,
      progress,
      attendance,
      exams,
      notifications,
      memberPrograms,
      currentUserId: currentUser?.id || null,
    });
  }, [
    hydrated,
    users,
    seasons,
    registrations,
    groups,
    progress,
    attendance,
    exams,
    notifications,
    memberPrograms,
    currentUser,
  ]);

  // Synchroniser les champs mock (nom, groupe…) sans écraser le rôle de routing
  // fixé par Supabase — bug : setCurrentUser(fresh) remettait role='member' quand
  // profiles.role était erroné mais la fiche seed locale avait le bon rôle.
  useEffect(() => {
    if (!currentUser || supabaseSession?.user?.id) return;
    const fresh = users.find((u) => u.id === currentUser.id);
    if (fresh && fresh !== currentUser) setCurrentUser(fresh);
  }, [users, currentUser, supabaseSession]);

  const login = async (email, password, options = {}) => {
    const mail = String(email || "").trim().toLowerCase();
    const preferredRole = options.preferredRole || null;

    if (isSupabaseConfigured()) {
      const authResult = await signInWithEmailPassword(mail, password);
      if (!authResult.ok) return authResult;
      setSupabaseSession(authResult.session);

      const profile = authResult.profile;
      let local = users.find(
        (u) =>
          u.email?.toLowerCase() === mail ||
          u.authId === profile.id
      );

      const appUser = profileToAppUser(profile, local || {});
      // Conserver l'id local pour les groupes / progress
      if (local) {
        appUser.id = local.id;
        const rolesForRouting = mergeRolesForRouting(profile, local);
        const sessionRole = resolveSessionRole(
          { ...appUser, roles: rolesForRouting },
          preferredRole
        );
        appUser.roles = rolesForRouting;
        appUser.role = sessionRole;
        setUsers((prev) =>
          prev.map((u) =>
            u.id === local.id
              ? {
                  ...u,
                  authId: profile.id,
                  role: sessionRole,
                  roles: rolesForRouting,
                  accountStatus: ACCOUNT_STATUS.ACTIVE,
                  password: null,
                  firstName: appUser.firstName || u.firstName,
                  lastName: appUser.lastName || u.lastName,
                }
              : u
          )
        );
      } else {
        // Premier login Auth sans fiche locale (ex. admin créé dans Supabase)
        const rolesForRouting = mergeRolesForRouting(profile, null);
        const sessionRole = resolveSessionRole(
          { ...appUser, roles: rolesForRouting },
          preferredRole
        );
        const created = {
          ...appUser,
          id: uid("u"),
          role: sessionRole,
          roles: rolesForRouting,
        };
        setUsers((prev) => [...prev, created]);
        local = created;
        appUser.id = created.id;
        appUser.roles = rolesForRouting;
        appUser.role = sessionRole;
      }

      const sessionUser = applySupabaseSessionRole(
        appUser,
        profile,
        local,
        preferredRole
      );
      setCurrentUser(sessionUser);
      maybeRefreshSupervisorPushRegistration(profile.id, sessionUser.role);
      return {
        ok: true,
        user: sessionUser,
        dashboard: DASHBOARD_BY_ROLE[sessionUser.role],
      };
    }

    // Fallback local (sans .env Supabase)
    const user = users.find((u) => u.email.toLowerCase() === mail);
    if (!user) {
      return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
    }
    if (user.accountStatus === ACCOUNT_STATUS.INVITED || !user.password) {
      return {
        ok: false,
        error: "الحساب غير مفعّل بعد — أنشئ كلمة المرور من شاشة إنشاء الحساب",
      };
    }
    if (user.password !== password) {
      return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
    }
    const sessionRole = resolveSessionRole(user, preferredRole);
    const sessionUser = {
      ...user,
      role: sessionRole,
      roles: normalizeRoles(user),
    };
    setCurrentUser(sessionUser);
    return {
      ok: true,
      user: sessionUser,
      dashboard: DASHBOARD_BY_ROLE[sessionRole],
    };
  };

  const logout = async () => {
    // Vider la session locale d'abord pour éviter que LoginScreen
    // redirige vers le dashboard tant que signOutAuth n'a pas fini.
    setCurrentUser(null);
    setSupabaseSession(null);
    await signOutAuth();
  };

  /** Dev only: efface AsyncStorage et remet l'état sur les données de seed.js */
  const resetToSeedData = async () => {
    await clearAppState();
    setUsers(emptyState.users);
    setSeasons(emptyState.seasons);
    setRegistrations(emptyState.registrations);
    setGroups(emptyState.groups);
    setProgress(emptyState.progress);
    setAttendance(emptyState.attendance);
    setExams(emptyState.exams);
    setNotifications(emptyState.notifications);
    setMemberPrograms(emptyState.memberPrograms || []);
    setSupabaseSession(null);
    setCurrentUser(null);
  };

  /** Demande d'inscription publique (sans mot de passe) */
  const submitMemberApplication = async ({
    fullName,
    school = "",
    level,
    phone,
    hifzAmount = "",
    seasonId,
    email = "",
    gender = "",
    seanceId = null,
    seanceName = "",
  }) => {
    const name = String(fullName || "").trim();
    const phoneClean = String(phone || "").trim();
    const schoolClean = String(school || "").trim();
    const levelClean = String(level || "").trim();
    const hifzClean = String(hifzAmount || "").trim();
    const emailClean = String(email || "").trim().toLowerCase();
    const genderClean = String(gender || "").trim();
    if (!name || !schoolClean || !levelClean || !phoneClean || !emailClean) {
      return { ok: false, error: "الرجاء ملء جميع الحقول المطلوبة" };
    }
    if (!genderClean || (genderClean !== "ذكر" && genderClean !== "أنثى")) {
      return { ok: false, error: "اختر الجنس (ذكر أو أنثى)" };
    }
    if (!seanceId) {
      return { ok: false, error: "اختر الحصة المناسبة لجنسك" };
    }
    if (!emailClean.includes("@")) {
      return { ok: false, error: "أدخل بريداً إلكترونياً صالحاً" };
    }
    // Inscription membre toujours ouverte — rattachement optionnel au saison actif
    const resolvedSeasonId =
      seasonId ||
      seasons.find((s) => s.active)?.id ||
      seasons[0]?.id ||
      null;
    const duplicate = registrations.find(
      (r) =>
        r.phone === phoneClean &&
        (r.seasonId || null) === (resolvedSeasonId || null) &&
        r.status !== REGISTRATION_STATUS.REJECTED
    );
    if (duplicate) {
      return { ok: false, error: "لديك طلب تسجيل مسبقاً" };
    }

    const { firstName, lastName } = splitFullName(name);
    const registration = {
      id: uid("r"),
      kind: REGISTRATION_KIND.JOIN,
      userId: null,
      seasonId: resolvedSeasonId,
      fullName: name,
      firstName,
      lastName,
      school: schoolClean,
      level: levelClean,
      phone: phoneClean,
      hifzAmount: hifzClean,
      email: emailClean,
      gender: genderClean,
      seanceId,
      seanceName: String(seanceName || "").trim(),
      freeTimes: [],
      status: REGISTRATION_STATUS.PENDING,
      inviteToken: null,
      createdAt: todayStr(),
    };

    if (isSupabaseConfigured()) {
      const sync = await insertPendingMemberApplication(registration);
      if (!sync.ok && !sync.skipped) {
        return { ok: false, error: sync.error || "تعذر حفظ الطلب" };
      }
    }

    setRegistrations((prev) => [...prev, registration]);
    pushNotification({
      title: "طلب انضمام جديد",
      body: `طلب انضمام من ${name} — راجعه من طلبات الانضمام`,
      audience: "admin",
    });
    return { ok: true, registration };
  };

  /** Compat: ancien enregistrement compte immédiat (évite casser les appels) */
  const registerAccount = ({
    firstName,
    lastName,
    birthDate,
    email,
    password,
    gender = "غير محدد",
  }) => {
    if (
      users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    ) {
      return { ok: false, error: "هذا البريد مستخدم مسبقاً" };
    }
    const user = {
      id: uid("u"),
      email: email.trim().toLowerCase(),
      password,
      firstName,
      lastName,
      birthDate,
      gender,
      role: ROLES.MEMBER,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
    };
    setUsers((prev) => [...prev, user]);
    return { ok: true, user };
  };

  const resetPassword = async (email, newPassword) => {
    // Avec Supabase : envoi d'un e-mail de récupération (OTP)
    if (isSupabaseConfigured()) {
      return requestPasswordReset(email);
    }

    const mail = email.trim().toLowerCase();
    const exists = users.find((u) => u.email.toLowerCase() === mail);
    if (!exists) {
      return { ok: false, error: "لا يوجد حساب بهذا البريد" };
    }
    if (!newPassword || newPassword.length < 4) {
      return { ok: false, error: "كلمة المرور قصيرة جداً" };
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.email.toLowerCase() === mail ? { ...u, password: newPassword } : u
      )
    );
    return { ok: true };
  };

  const confirmPasswordReset = async (email, token, newPassword) => {
    if (!isSupabaseConfigured()) {
      return { ok: false, error: "Supabase غير مفعّل" };
    }
    return confirmPasswordResetWithOtp(email, token, newPassword);
  };

  const createSeason = (payload) => {
    const { openRegistration = false, activate = false, ...rest } = payload;
    const season = {
      id: uid("s"),
      registrationOpen: !!openRegistration,
      active: false,
      remote: rest.type === "summer" || !!rest.remote,
      ...rest,
    };
    setSeasons((prev) => {
      let next = [...prev, season];
      if (activate) {
        next = next.map((s) =>
          s.type === season.type
            ? { ...s, active: s.id === season.id }
            : s
        );
      }
      return next;
    });
    if (openRegistration) {
      pushNotification({
        title: "فتح باب التسجيل",
        body: `تم فتح استمارة التسجيل: ${season.name}`,
        audience: "members",
      });
    }
    return season;
  };

  const startNewSeason = async ({
    name,
    startDate,
    endDate,
    openRegistration = true,
  }) => {
    const seasonName = String(name || "").trim();
    const start = String(startDate || "").trim();
    const end = String(endDate || "").trim();
    if (!seasonName || !start || !end) {
      return { ok: false, error: "املأ جميع الحقول" };
    }

    const previousRegularIds = seasons
      .filter((s) => s.type === SEASON_TYPES.REGULAR)
      .map((s) => s.id);

    const season = {
      id: uid("s"),
      name: seasonName,
      type: SEASON_TYPES.REGULAR,
      startDate: start,
      endDate: end,
      registrationOpen: !!openRegistration,
      active: true,
      remote: false,
    };

    setSeasons((prev) => {
      const closed = prev.map((s) =>
        s.type === SEASON_TYPES.REGULAR
          ? { ...s, registrationOpen: false, active: false }
          : s
      );
      return [...closed, season];
    });

    await archiveSeancesForSaisonIds(previousRegularIds).catch(() => {});
    await closeRegularSaisons(previousRegularIds).catch(() => {});
    await upsertSaison(season).catch(() => {});

    const alertMessage = openRegistration
      ? `انطلاق موسم جديد: «${seasonName}» — باب التسجيل مفتوح الآن. انتقل إلى تبويب «التسجيل» لإعادة تسجيلك.`
      : `انطلاق موسم جديد: «${seasonName}» — سيفتح باب التسجيل لاحقاً.`;
    pushNotification({
      title: "انطلاق موسم جديد",
      body: alertMessage,
      audience: "members",
    });
    sendAlert(alertMessage, "members").catch(() => {});

    return { ok: true, season };
  };

  const announceRegistrationForm = (seasonId) => {
    const season = seasons.find((s) => s.id === seasonId);
    if (!season) return { ok: false, error: "الموسم غير موجود" };
    setSeasons((prev) =>
      prev.map((s) => {
        if (s.id === seasonId) {
          return { ...s, registrationOpen: true, active: true };
        }
        if (s.type === season.type) {
          return { ...s, active: false };
        }
        return s;
      })
    );
    const alertMessage = `فُتح باب التسجيل للموسم «${season.name}». انتقل إلى تبويب «التسجيل» لإعادة تسجيلك.`;
    pushNotification({
      title: "فتح باب التسجيل",
      body: alertMessage,
      audience: "members",
    });
    sendAlert(alertMessage, "members").catch(() => {});
    return { ok: true, season };
  };

  const updateSeason = (seasonId, patch) => {
    setSeasons((prev) =>
      prev.map((s) => (s.id === seasonId ? { ...s, ...patch } : s))
    );
  };

  const setRegistrationOpen = (seasonId, open) => {
    updateSeason(seasonId, { registrationOpen: open });
    const season = seasons.find((s) => s.id === seasonId);
    if (season && open) {
      const alertMessage = `فُتح باب التسجيل للموسم «${season.name}». انتقل إلى تبويب «التسجيل» لإعادة تسجيلك.`;
      pushNotification({
        title: "فتح باب التسجيل",
        body: alertMessage,
        audience: "members",
      });
      sendAlert(alertMessage, "members").catch(() => {});
    }
  };

  const activateSeason = (seasonId) => {
    setSeasons((prev) => {
      const target = prev.find((s) => s.id === seasonId);
      if (!target) return prev;
      return prev.map((s) =>
        s.type === target.type
          ? { ...s, active: s.id === seasonId }
          : s
      );
    });
  };

  const submitSeasonRegistration = ({
    seasonId,
    freeTimes,
    userId = currentUser?.id,
  }) => {
    if (!userId) return { ok: false, error: "يجب تسجيل الدخول" };
    const exists = registrations.find(
      (r) => r.userId === userId && r.seasonId === seasonId
    );
    if (exists) {
      return { ok: false, error: "لديك طلب تسجيل مسبقاً لهذا الموسم" };
    }
    const season = seasons.find((s) => s.id === seasonId);
    if (!season?.registrationOpen) {
      return { ok: false, error: "باب التسجيل مغلق حالياً" };
    }
    const registration = {
      id: uid("r"),
      kind: REGISTRATION_KIND.SEASON_RENEWAL,
      userId,
      seasonId,
      freeTimes,
      status: REGISTRATION_STATUS.PENDING,
      createdAt: todayStr(),
    };
    setRegistrations((prev) => [...prev, registration]);
    pushNotification({
      title: "إعادة تسجيل موسم",
      body: "وصل طلب إعادة تسجيل من عضو حالي — راجعه من طلبات التسجيل",
      audience: "admin",
    });
    return { ok: true, registration };
  };

  const reviewRegistration = async (registrationId, status) => {
    try {
      const reg = registrations.find((r) => r.id === registrationId);
      if (!reg) return { ok: false, error: "الطلب غير موجود" };

      const kind = getRegistrationKind(reg);
      const isSeasonRenewal = kind === REGISTRATION_KIND.SEASON_RENEWAL;

      if (status === REGISTRATION_STATUS.REJECTED) {
        if (!isSeasonRenewal) {
          const sync = await upsertMemberApplication(
            reg,
            REGISTRATION_STATUS.REJECTED
          );
          if (!sync.ok) {
            return {
              ok: false,
              error: sync.error || "تعذر حفظ الرفض في Supabase",
            };
          }
        }

        setRegistrations((prev) =>
          prev.map((r) =>
            r.id === registrationId
              ? { ...r, status: REGISTRATION_STATUS.REJECTED }
              : r
          )
        );
        pushNotification({
          title: isSeasonRenewal ? "رُفضت إعادة التسجيل" : "تم رفض طلب الانضمام",
          body: isSeasonRenewal
            ? "رُفض طلب إعادة تسجيل موسم"
            : `رُفض طلب: ${reg.fullName || reg.phone}`,
          audience: isSeasonRenewal && reg.userId ? "user" : "admin",
          userId: isSeasonRenewal ? reg.userId : undefined,
        });
        return { ok: true, kind };
      }

      if (status === REGISTRATION_STATUS.ACCEPTED) {
        const acceptedAt = todayStr();

        if (isSeasonRenewal) {
          setRegistrations((prev) =>
            prev.map((r) =>
              r.id === registrationId
                ? { ...r, status: REGISTRATION_STATUS.ACCEPTED, acceptedAt }
                : r
            )
          );
          if (reg.userId) {
            pushNotification({
              title: "قُبل تسجيلك للموسم",
              body: "تم قبول طلب إعادة تسجيلك للموسم الجديد.",
              audience: "user",
              userId: reg.userId,
            });
          }
          pushNotification({
            title: "إعادة تسجيل مقبولة",
            body: "قُبلت إعادة تسجيل عضو للموسم.",
            audience: "admin",
          });
          return { ok: true, registration: reg, kind };
        }

        const sync = await upsertMemberApplication(
          { ...reg, acceptedAt },
          REGISTRATION_STATUS.INVITED
        );
        if (!sync.ok) {
          return {
            ok: false,
            error:
              sync.error ||
              "تعذر حفظ بيانات العضو في Supabase — نفّذ member_applications.sql وتأكد من جلسة الأدمن",
          };
        }

        setRegistrations((prev) =>
          prev.map((r) =>
            r.id === registrationId
              ? {
                  ...r,
                  status: REGISTRATION_STATUS.INVITED,
                  inviteToken: null,
                  acceptedAt,
                }
              : r
          )
        );
        pushNotification({
          title: "دعوة انضمام",
          body: `تم قبول طلب انضمام ${reg.fullName}. يمكنه إنشاء حسابه بالبريد الإلكتروني.`,
          audience: "admin",
        });
        return { ok: true, registration: reg, kind };
      }

      setRegistrations((prev) =>
        prev.map((r) => (r.id === registrationId ? { ...r, status } : r))
      );
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e?.message || "حدث خطأ أثناء مراجعة الطلب",
      };
    }
  };

  /** إنشاء حساب العضو بعد قبول الطلب (بالبريد، بدون رمز دعوة) */
  const activateInvite = async ({ email, password, confirmPassword }) => {
    const mail = String(email || "").trim().toLowerCase();
    if (!mail) return { ok: false, error: "أدخل البريد الإلكتروني" };
    if (!password || password.length < 6) {
      return { ok: false, error: "كلمة المرور قصيرة جداً (6 أحرف على الأقل)" };
    }
    if (password !== confirmPassword) {
      return { ok: false, error: "كلمة المرور غير متطابقة" };
    }

    const pendingUser = users.find(
      (u) =>
        u.email?.toLowerCase() === mail &&
        u.accountStatus === ACCOUNT_STATUS.INVITED &&
        u.role === ROLES.MEMBER
    );
    if (pendingUser) {
      if (isSupabaseConfigured()) {
        const authResult = await signUpWithProfile({
          email: pendingUser.email,
          password,
          role: pendingUser.role,
          firstName: pendingUser.firstName,
          lastName: pendingUser.lastName,
        });
        if (!authResult.ok) return authResult;
        setUsers((prev) =>
          prev.map((u) =>
            u.id === pendingUser.id
              ? {
                  ...u,
                  password: null,
                  authId: authResult.authUser.id,
                  accountStatus: ACCOUNT_STATUS.ACTIVE,
                  inviteToken: null,
                }
              : u
          )
        );
        pushNotification({
          title: "تم تفعيل الحساب",
          body: `مرحباً ${pendingUser.firstName}، حسابك جاهز لتسجيل الدخول`,
          audience: "user",
          userId: pendingUser.id,
        });
        return {
          ok: true,
          user: {
            ...pendingUser,
            password: null,
            authId: authResult.authUser.id,
            accountStatus: ACCOUNT_STATUS.ACTIVE,
          },
          role: pendingUser.role,
          needsEmailConfirmation: authResult.needsEmailConfirmation,
        };
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === pendingUser.id
            ? {
                ...u,
                password,
                accountStatus: ACCOUNT_STATUS.ACTIVE,
                inviteToken: null,
              }
            : u
        )
      );
      pushNotification({
        title: "تم تفعيل الحساب",
        body: `مرحباً ${pendingUser.firstName}، حسابك جاهز لتسجيل الدخول`,
        audience: "user",
        userId: pendingUser.id,
      });
      return {
        ok: true,
        user: { ...pendingUser, password, accountStatus: ACCOUNT_STATUS.ACTIVE },
        role: pendingUser.role,
      };
    }

    const reg = registrations.find(
      (r) =>
        r.email?.toLowerCase() === mail &&
        r.status === REGISTRATION_STATUS.INVITED
    );
    if (!reg) {
      return {
        ok: false,
        error: "لا توجد دعوة مقبولة لهذا البريد أو الحساب مفعّل مسبقاً",
      };
    }

    const existingUser = users.find((u) => u.email.toLowerCase() === mail);

    if (existingUser && userHasRole(existingUser, ROLES.SUPERVISOR)) {
      return {
        ok: false,
        error:
          "هذا البريد لحساب مشرف. لا يُستخدم كحساب عضو — أدخل بريداً آخر للعضو.",
      };
    }
    if (existingUser && userHasRole(existingUser, ROLES.ADMIN)) {
      return {
        ok: false,
        error:
          "هذا البريد لحساب الإدارة. استخدم بريداً آخر لإنشاء حساب العضو.",
      };
    }

    // Même e-mail déjà utilisé pour un membre → réactivation du même الحساب
    if (existingUser) {
      let authId = existingUser.authId || null;
      let needsEmailConfirmation = false;

      if (isSupabaseConfigured()) {
        if (authId || existingUser.accountStatus === ACCOUNT_STATUS.ACTIVE) {
          const authResult = await signInWithEmailPassword(mail, password);
          if (!authResult.ok) {
            return {
              ok: false,
              error:
                authResult.error ||
                "كلمة المرور غير صحيحة للحساب الموجود بهذا البريد",
            };
          }
          authId = authResult.authUser.id;
          await markMemberApplicationActivated({
            email: mail,
            userId: authId,
          });
          await signOutAuth();
        } else {
          const authResult = await signUpWithProfile({
            email: mail,
            password,
            role: existingUser.role || ROLES.MEMBER,
            firstName:
              existingUser.firstName ||
              reg.firstName ||
              splitFullName(reg.fullName).firstName,
            lastName:
              existingUser.lastName ||
              reg.lastName ||
              splitFullName(reg.fullName).lastName,
          });
          if (!authResult.ok) return authResult;
          authId = authResult.authUser.id;
          needsEmailConfirmation = !!authResult.needsEmailConfirmation;
        }
      } else if (
        existingUser.accountStatus === ACCOUNT_STATUS.ACTIVE &&
        existingUser.password &&
        existingUser.password !== password
      ) {
        return {
          ok: false,
          error: "كلمة المرور غير صحيحة للحساب الموجود بهذا البريد",
        };
      }

      const merged = withMergedRoles(
        {
          ...existingUser,
          authId,
          password: isSupabaseConfigured()
            ? null
            : existingUser.password || password,
          accountStatus: ACCOUNT_STATUS.ACTIVE,
          inviteToken: null,
          school: reg.school || existingUser.school || "",
          level: reg.level || existingUser.level,
          phone: reg.phone || existingUser.phone,
          hifzAmount: reg.hifzAmount || existingUser.hifzAmount || "",
          seasonId: reg.seasonId || existingUser.seasonId,
        },
        ROLES.MEMBER
      );

      setUsers((prev) =>
        prev.map((u) => (u.id === existingUser.id ? merged : u))
      );
      setRegistrations((prev) =>
        prev.map((r) =>
          r.id === reg.id
            ? {
                ...r,
                status: REGISTRATION_STATUS.ACTIVATED,
                userId: existingUser.id,
                inviteToken: null,
              }
            : r
        )
      );
      pushNotification({
        title: "تم تفعيل عضوية الحساب",
        body: `تم ربط طلب الانضمام بالحساب الموجود (${mail})`,
        audience: "user",
        userId: existingUser.id,
      });
      return {
        ok: true,
        user: merged,
        role: ROLES.MEMBER,
        needsEmailConfirmation,
      };
    }

    let authId = null;
    let needsEmailConfirmation = false;
    if (isSupabaseConfigured()) {
      const authResult = await signUpWithProfile({
        email: mail,
        password,
        role: ROLES.MEMBER,
        firstName: reg.firstName || splitFullName(reg.fullName).firstName,
        lastName: reg.lastName || splitFullName(reg.fullName).lastName,
      });
      if (!authResult.ok) return authResult;
      authId = authResult.authUser.id;
      needsEmailConfirmation = !!authResult.needsEmailConfirmation;
    }

    const user = {
      id: uid("u"),
      authId,
      email: mail,
      password: isSupabaseConfigured() ? null : password,
      firstName: reg.firstName || splitFullName(reg.fullName).firstName,
      lastName: reg.lastName || splitFullName(reg.fullName).lastName,
      birthDate: "2000/01/01",
      school: reg.school || "",
      level: reg.level,
      phone: reg.phone,
      hifzAmount: reg.hifzAmount || "",
      gender: "غير محدد",
      role: ROLES.MEMBER,
      roles: [ROLES.MEMBER],
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      seasonId: reg.seasonId,
    };
    setUsers((prev) => [...prev, user]);
    setRegistrations((prev) =>
      prev.map((r) =>
        r.id === reg.id
          ? {
              ...r,
              status: REGISTRATION_STATUS.ACTIVATED,
              userId: user.id,
              inviteToken: null,
            }
          : r
      )
    );
    pushNotification({
      title: "تم إنشاء الحساب",
      body: `مرحباً ${user.firstName}، يمكنك تسجيل الدخول الآن`,
      audience: "user",
      userId: user.id,
    });
    return {
      ok: true,
      user,
      role: ROLES.MEMBER,
      needsEmailConfirmation,
    };
  };

  /** إنشاء حساب المشرف بالبريد (بعد تعيينه من الإدارة) */
  const activateSupervisorAccount = async ({
    fullName,
    email,
    password,
    confirmPassword,
  }) => {
    const name = String(fullName || "").trim();
    const mail = String(email || "").trim().toLowerCase();
    if (!name) return { ok: false, error: "أدخل الاسم الكامل" };
    if (!mail) return { ok: false, error: "أدخل البريد الإلكتروني" };
    if (!password || password.length < 6) {
      return { ok: false, error: "كلمة المرور قصيرة جداً (6 أحرف على الأقل)" };
    }
    if (password !== confirmPassword) {
      return { ok: false, error: "كلمة المرور غير متطابقة" };
    }

    const pendingUser = users.find(
      (u) =>
        u.email.toLowerCase() === mail &&
        u.role === ROLES.SUPERVISOR &&
        u.accountStatus === ACCOUNT_STATUS.INVITED
    );
    if (!pendingUser) {
      return {
        ok: false,
        error: "لا توجد دعوة مشرف لهذا البريد أو الحساب مفعّل مسبقاً",
      };
    }

    const expectedName = normalizeName(
      `${pendingUser.firstName} ${pendingUser.lastName}`
    );
    if (normalizeName(name) !== expectedName) {
      return {
        ok: false,
        error: "الاسم الكامل لا يطابق البيانات المسجلة لدى الإدارة",
      };
    }

    const { firstName, lastName } = splitFullName(name);

    if (isSupabaseConfigured()) {
      const authResult = await signUpWithProfile({
        email: mail,
        password,
        role: ROLES.SUPERVISOR,
        firstName,
        lastName,
      });
      if (!authResult.ok) return authResult;

      setUsers((prev) =>
        prev.map((u) =>
          u.id === pendingUser.id
            ? {
                ...u,
                firstName,
                lastName,
                password: null,
                authId: authResult.authUser.id,
                accountStatus: ACCOUNT_STATUS.ACTIVE,
                inviteToken: null,
              }
            : u
        )
      );
      pushNotification({
        title: "تم إنشاء الحساب",
        body: `مرحباً ${pendingUser.firstName}، حسابك جاهز لتسجيل الدخول`,
        audience: "user",
        userId: pendingUser.id,
      });
      return {
        ok: true,
        user: {
          ...pendingUser,
          firstName,
          lastName,
          password: null,
          authId: authResult.authUser.id,
          accountStatus: ACCOUNT_STATUS.ACTIVE,
        },
        role: ROLES.SUPERVISOR,
        needsEmailConfirmation: authResult.needsEmailConfirmation,
      };
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === pendingUser.id
          ? {
              ...u,
              firstName,
              lastName,
              password,
              accountStatus: ACCOUNT_STATUS.ACTIVE,
              inviteToken: null,
            }
          : u
      )
    );
    pushNotification({
      title: "تم إنشاء الحساب",
      body: `مرحباً ${pendingUser.firstName}، حسابك جاهز لتسجيل الدخول`,
      audience: "user",
      userId: pendingUser.id,
    });
    return {
      ok: true,
      user: {
        ...pendingUser,
        password,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
      },
      role: ROLES.SUPERVISOR,
    };
  };

  const findRegistrationByPhone = (phone) => {
    const phoneClean = String(phone || "").trim();
    return registrations
      .filter((r) => r.phone === phoneClean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  };

  const createGroup = ({
    seasonId,
    name,
    freeTimeSlot,
    supervisorId,
    schedule,
    remote = false,
  }) => {
    const group = {
      id: uid("g"),
      seasonId,
      name,
      freeTimeSlot,
      supervisorId,
      memberIds: [],
      schedule,
      remote,
    };
    setGroups((prev) => [...prev, group]);
    return group;
  };

  const updateGroup = (groupId, patch) => {
    const target = groups.find((g) => g.id === groupId);
    if (!target) return { ok: false, error: "المجموعة غير موجودة" };
    const name = patch.name !== undefined ? String(patch.name).trim() : null;
    if (name !== null && !name) {
      return { ok: false, error: "اسم المجموعة مطلوب" };
    }
    if (patch.supervisorId) {
      const supervisor = users.find(
        (u) =>
          u.id === patch.supervisorId && userHasRole(u, ROLES.SUPERVISOR)
      );
      if (!supervisor) {
        return { ok: false, error: "المشرف المحدد غير موجود" };
      }
    }
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              ...(name !== null ? { name } : {}),
              ...(patch.supervisorId !== undefined
                ? { supervisorId: patch.supervisorId }
                : {}),
            }
          : g
      )
    );
    return { ok: true };
  };

  const deleteGroup = (groupId) => {
    const target = groups.find((g) => g.id === groupId);
    if (!target) return { ok: false, error: "المجموعة غير موجودة" };
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setProgress((prev) => prev.filter((p) => p.groupId !== groupId));
    setAttendance((prev) => prev.filter((a) => a.groupId !== groupId));
    setExams((prev) => prev.filter((e) => e.groupId !== groupId));
    return { ok: true };
  };

  const assignMemberToGroup = (groupId, memberId) => {
    setGroups((prev) => {
      const target = prev.find((g) => g.id === groupId);
      const updated = prev.map((g) => {
        if (g.id === groupId) {
          if (g.memberIds.includes(memberId)) return g;
          return { ...g, memberIds: [...g.memberIds, memberId] };
        }
        return {
          ...g,
          memberIds: g.memberIds.filter((id) => id !== memberId),
        };
      });

      if (target) {
        setProgress((prevProgress) => {
          const existing = prevProgress.find(
            (p) => p.memberId === memberId && p.seasonId === target.seasonId
          );
          if (existing) {
            return prevProgress.map((p) =>
              p.id === existing.id ? { ...p, groupId } : p
            );
          }
          return [
            ...prevProgress,
            {
              id: uid("p"),
              memberId,
              groupId,
              seasonId: target.seasonId,
              hifzPages: 0,
              reviewPages: 0,
              targetPages: 60,
              notes: [],
              lastEvaluation: "—",
            },
          ];
        });
        pushNotification({
          title: "تم توزيعك على مجموعة",
          body: `أُسندت إلى المجموعة: ${target.name}`,
          audience: "user",
          userId: memberId,
        });
      }

      return updated;
    });
  };

  const assignSupervisorToGroup = (groupId, supervisorId) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, supervisorId } : g))
    );
  };

  /** حذف مشرف ثانوي (يمكن إعادة إضافته لاحقاً بنفس البريد) */
  const removeSupervisor = (supervisorId) => {
    const target = users.find(
      (u) => u.id === supervisorId && userHasRole(u, ROLES.SUPERVISOR)
    );
    if (!target) {
      return { ok: false, error: "المشرف غير موجود" };
    }

    setGroups((prev) =>
      prev.map((g) =>
        g.supervisorId === supervisorId ? { ...g, supervisorId: null } : g
      )
    );

    // Si le compte a aussi le rôle membre, on retire seulement le rôle superviseur
    if (userHasRole(target, ROLES.MEMBER) || userHasRole(target, ROLES.ADMIN)) {
      const nextRoles = normalizeRoles(target).filter(
        (r) => r !== ROLES.SUPERVISOR
      );
      setUsers((prev) =>
        prev.map((u) =>
          u.id === supervisorId
            ? {
                ...u,
                role: nextRoles[0] || ROLES.MEMBER,
                roles: nextRoles,
              }
            : u
        )
      );
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== supervisorId));
      if (currentUser?.id === supervisorId) {
        setCurrentUser(null);
      }
    }

    pushNotification({
      title: "تم حذف مشرف",
      body: `تم حذف ${target.firstName} ${target.lastName}`,
      audience: "admin",
    });

    return { ok: true };
  };

  const addSupervisor = ({
    firstName,
    lastName,
    email,
    birthDate = "2000/01/01",
    gender = "ذكر",
    groupName,
    groupId,
    newGroup,
    seasonId: seasonIdArg,
  }) => {
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return { ok: false, error: "املأ الاسم واللقب والبريد" };
    }

    const mail = email.trim().toLowerCase();

    const typedName = (groupName || newGroup?.name || "").trim();
    const seasonId =
      seasonIdArg ||
      newGroup?.seasonId ||
      seasons.find((s) => s.active)?.id ||
      seasons[0]?.id ||
      null;

    if (!groupId && !typedName) {
      return {
        ok: false,
        error: "أدخل اسم المجموعة المعنية بهذا المشرف",
      };
    }
    if (users.some((u) => u.email.toLowerCase() === mail)) {
      return { ok: false, error: "هذا البريد مستخدم مسبقاً" };
    }

    let assignedGroup = null;
    let pendingNewGroup = null;
    let created = false;

    if (groupId) {
      assignedGroup = groups.find((g) => g.id === groupId);
      if (!assignedGroup) {
        return { ok: false, error: "المجموعة المحددة غير موجودة" };
      }
    } else {
      const match = groups.find(
        (g) => g.name.trim().toLowerCase() === typedName.toLowerCase()
      );
      if (match) {
        assignedGroup = match;
      } else {
        const sid =
          seasonId || seasons.find((s) => s.active)?.id || seasons[0]?.id || null;
        pendingNewGroup = {
          id: uid("g"),
          seasonId: sid,
          name: typedName,
          freeTimeSlot: newGroup?.freeTimeSlot || "",
          supervisorId: null,
          memberIds: [],
          schedule: newGroup?.schedule || "",
          remote: !!newGroup?.remote,
        };
        created = true;
      }
    }

    const token = inviteToken();
    const resolvedSeasonId =
      assignedGroup?.seasonId || pendingNewGroup?.seasonId || seasonId;

    const user = {
      id: uid("u"),
      email: mail,
      password: null,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      gender,
      role: ROLES.SUPERVISOR,
      accountStatus: ACCOUNT_STATUS.INVITED,
      inviteToken: token,
      seasonId: resolvedSeasonId,
    };
    setUsers((prev) => [...prev, user]);

    if (assignedGroup && !pendingNewGroup) {
      assignSupervisorToGroup(assignedGroup.id, user.id);
      assignedGroup = { ...assignedGroup, supervisorId: user.id };
    } else if (pendingNewGroup) {
      assignedGroup = { ...pendingNewGroup, supervisorId: user.id };
      setGroups((prev) => [...prev, assignedGroup]);
    }

    pushNotification({
      title: "تمت إضافة مشرف",
      body: `تم تعيين ${user.firstName} ${user.lastName} على ${assignedGroup?.name || typedName}`,
      audience: "admin",
    });

    return {
      ok: true,
      user,
      group: assignedGroup,
      groupName: assignedGroup?.name || typedName,
      created,
      inviteToken: token,
    };
  };

  const addMember = ({
    firstName,
    lastName,
    birthDate,
    gender,
    groupId,
    email,
    password = "123456",
  }) => {
    if (!firstName?.trim() || !lastName?.trim()) {
      return { ok: false, error: "املأ الاسم واللقب" };
    }
    const mail =
      email?.trim().toLowerCase() || `member_${Date.now()}@mosque.ma`;
    if (users.some((u) => u.email.toLowerCase() === mail)) {
      return { ok: false, error: "هذا البريد مستخدم مسبقاً" };
    }
    const user = {
      id: uid("u"),
      email: mail,
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birthDate || "2000/01/01",
      gender: gender || "غير محدد",
      role: ROLES.MEMBER,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
    };
    setUsers((prev) => [...prev, user]);
    if (groupId) {
      assignMemberToGroup(groupId, user.id);
    }
    return { ok: true, user };
  };

  const saveAttendance = (groupId, date, records) => {
    setAttendance((prev) => {
      const existing = prev.find(
        (a) => a.groupId === groupId && a.date === date
      );
      if (existing) {
        return prev.map((a) =>
          a.id === existing.id ? { ...a, records } : a
        );
      }
      return [...prev, { id: uid("a"), groupId, date, records }];
    });
  };

  const updateMemberProgress = (progressId, patch) => {
    setProgress((prev) =>
      prev.map((p) => (p.id === progressId ? { ...p, ...patch } : p))
    );
  };

  const updateMemberHifzGoal = async (hifzAmount) => {
    const clean = String(hifzAmount || "").trim();
    if (!clean) {
      return { ok: false, error: "أدخل هدفك أولاً" };
    }
    if (!currentUser) {
      return { ok: false, error: "يجب تسجيل الدخول" };
    }

    if (currentUser.authId && isSupabaseConfigured()) {
      const sync = await updateMemberInfo(currentUser.authId, {
        hifzAmount: clean,
      });
      if (!sync.ok) {
        return sync;
      }
    }

    const patchUser = (user) =>
      user.id === currentUser.id ? { ...user, hifzAmount: clean } : user;

    setUsers((prev) => prev.map(patchUser));
    setCurrentUser((prev) => (prev ? { ...prev, hifzAmount: clean } : prev));
    return { ok: true, hifzAmount: clean };
  };

  const getMemberPrograms = (memberId = currentUser?.id) =>
    memberPrograms.filter((p) => p.userId === memberId);

  const saveMemberProgram = (program, memberId = currentUser?.id) => {
    if (!memberId) return { ok: false, error: "يجب تسجيل الدخول" };
    const title = String(program.title || "").trim();
    const nbHizb = Number(program.nbHizb);
    const durationDays = Number(program.durationDays);
    const progression = Math.min(
      100,
      Math.max(0, Number(program.progression) || 0)
    );
    if (!title) return { ok: false, error: "أدخل اسم البرنامج" };
    if (!Number.isFinite(nbHizb) || nbHizb <= 0) {
      return { ok: false, error: "أدخل عدد أحزاب صحيحاً" };
    }
    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      return { ok: false, error: "أدخل مدة صحيحة بالأيام" };
    }

    const row = {
      id: program.id || uid("mp"),
      userId: memberId,
      title,
      nbHizb,
      durationDays,
      startDate: String(program.startDate || todayStr()).trim() || todayStr(),
      progression,
    };

    setMemberPrograms((prev) => {
      const exists = prev.some((p) => p.id === row.id);
      if (exists) {
        return prev.map((p) => (p.id === row.id ? { ...p, ...row } : p));
      }
      return [...prev, row];
    });
    return { ok: true, program: row };
  };

  const deleteMemberProgram = (programId, memberId = currentUser?.id) => {
    if (!memberId || !programId) {
      return { ok: false, error: "معرّف البرنامج مفقود" };
    }
    setMemberPrograms((prev) =>
      prev.filter((p) => !(p.id === programId && p.userId === memberId))
    );
    return { ok: true };
  };

  const updateMemberProgramProgress = (
    programId,
    progression,
    memberId = currentUser?.id
  ) => {
    const pct = Math.min(100, Math.max(0, Number(progression) || 0));
    const target = memberPrograms.find(
      (p) => p.id === programId && p.userId === memberId
    );
    if (!target) return { ok: false, error: "البرنامج غير موجود" };
    return saveMemberProgram({ ...target, progression: pct }, memberId);
  };

  const addProgressNote = (progressId, note) => {
    setProgress((prev) =>
      prev.map((p) =>
        p.id === progressId
          ? { ...p, notes: [...(p.notes || []), note] }
          : p
      )
    );
  };

  const addExamResult = ({
    memberId,
    groupId,
    seasonId,
    score,
    level,
    notes,
  }) => {
    const exam = {
      id: uid("e"),
      memberId,
      groupId,
      seasonId,
      score: Number(score),
      level,
      notes,
      date: todayStr(),
      status: "completed",
      title: level ? `نتيجة — ${level}` : "نتيجة اختبار",
    };
    setExams((prev) => [...prev, exam]);
    pushNotification({
      title: "نتيجة اختبار جديدة",
      body: `درجتك: ${score} — المستوى: ${level}`,
      audience: "user",
      userId: memberId,
    });
    return exam;
  };

  const createExam = ({
    title,
    description,
    date,
    groupId,
    memberIds,
    notifyMembers = true,
  }) => {
    const cleanTitle = (title || "").trim();
    const cleanDate = (date || "").trim();
    const ids = Array.isArray(memberIds)
      ? [...new Set(memberIds.filter(Boolean))]
      : [];

    if (!cleanTitle) return { ok: false, error: "أدخل عنوان الاختبار" };
    if (!cleanDate) return { ok: false, error: "أدخل تاريخ الاختبار" };
    if (ids.length === 0) {
      return { ok: false, error: "اختر عضواً واحداً على الأقل" };
    }

    const exam = {
      id: uid("e"),
      title: cleanTitle,
      description: (description || "").trim(),
      date: cleanDate,
      groupId: groupId || null,
      memberIds: ids,
      status: "planned",
      createdAt: new Date().toISOString(),
    };
    setExams((prev) => [exam, ...prev]);

    if (notifyMembers) {
      ids.forEach((memberId) => {
        pushNotification({
          title: "اختبار جديد",
          body: `${exam.title} — بتاريخ ${exam.date}`,
          audience: "user",
          userId: memberId,
        });
      });
    }

    return { ok: true, exam };
  };

  const cancelExam = (examId) => {
    const target = exams.find((e) => e.id === examId);
    if (!target) return { ok: false, error: "الاختبار غير موجود" };
    setExams((prev) =>
      prev.map((e) =>
        e.id === examId ? { ...e, status: "cancelled" } : e
      )
    );
    return { ok: true };
  };

  const markExamCompleted = (examId) => {
    const target = exams.find((e) => e.id === examId);
    if (!target) return { ok: false, error: "الاختبار غير موجود" };
    setExams((prev) =>
      prev.map((e) =>
        e.id === examId ? { ...e, status: "completed" } : e
      )
    );
    return { ok: true };
  };

  function pushNotification({ title, body, audience = "all", userId = null }) {
    const item = {
      id: uid("n"),
      title,
      body,
      audience,
      userId,
      createdAt: new Date().toISOString(),
      readBy: [],
    };
    setNotifications((prev) => [item, ...prev].slice(0, 100));
  }

  const sendAlert = (text, audience = "all") => {
    const body = (text || "").trim();
    if (!body) return { ok: false, error: "اكتب نص التنبيه أولاً" };
    const allowed = ["all", "members", "supervisors"];
    const target = allowed.includes(audience) ? audience : "all";
    const titleByAudience = {
      all: "تنبيه من الإدارة",
      members: "تنبيه للأعضاء",
      supervisors: "تنبيه للمشرفين",
    };
    pushNotification({
      title: titleByAudience[target] || "تنبيه من الإدارة",
      body,
      audience: target,
    });
    return { ok: true, audience: target };
  };

  const getNotificationsForUser = (user = currentUser) => {
    if (!user) return [];
    return notifications.filter((n) => {
      if (n.audience === "all") return true;
      if (n.audience === "user" && n.userId === user.id) return true;
      if (n.audience === "admin" && userHasRole(user, ROLES.ADMIN)) return true;
      if (n.audience === "members" && userHasRole(user, ROLES.MEMBER)) {
        return true;
      }
      if (
        n.audience === "supervisors" &&
        userHasRole(user, ROLES.SUPERVISOR)
      ) {
        return true;
      }
      return false;
    });
  };

  const markNotificationRead = (notificationId, userId = currentUser?.id) => {
    if (!userId) return;
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId && !n.readBy.includes(userId)
          ? { ...n, readBy: [...n.readBy, userId] }
          : n
      )
    );
  };

  const getUserById = (id) => users.find((u) => u.id === id);

  const getSupervisors = () =>
    users.filter((u) => userHasRole(u, ROLES.SUPERVISOR));

  const getMemberGroup = (memberId, seasonId) =>
    groups.find(
      (g) =>
        g.memberIds.includes(memberId) &&
        (!seasonId || g.seasonId === seasonId)
    );

  const getMemberProgress = (memberId, seasonId) =>
    progress.find(
      (p) =>
        p.memberId === memberId && (!seasonId || p.seasonId === seasonId)
    );

  const getSupervisorGroups = (supervisorId) =>
    groups.filter((g) => g.supervisorId === supervisorId);

  const stats = useMemo(() => {
    const activeSeason = getActiveRegularSeason(seasons);
    const pendingRegs = registrations.filter(
      (r) =>
        r.status === REGISTRATION_STATUS.PENDING &&
        (!activeSeason || !r.seasonId || r.seasonId === activeSeason.id)
    ).length;
    const members = users.filter(
      (u) =>
        userHasRole(u, ROLES.MEMBER) &&
        u.accountStatus !== ACCOUNT_STATUS.INVITED
    ).length;
    const supervisors = users.filter((u) =>
      userHasRole(u, ROLES.SUPERVISOR)
    ).length;
    const groupsForSeason = activeSeason
      ? groups.filter((g) => g.seasonId === activeSeason.id)
      : groups;
    const avgProgress =
      progress.length === 0
        ? 0
        : Math.round(
            progress.reduce(
              (sum, p) =>
                sum +
                Math.min(
                  100,
                  Math.round(
                    ((p.hifzPages || 0) / (p.targetPages || 1)) * 100
                  )
                ),
              0
            ) / progress.length
          );
    return {
      pendingRegs,
      members,
      supervisors,
      groups: groupsForSeason.length,
      seasons: seasons.length,
      avgProgress,
      exams: exams.length,
      activeSeasonId: activeSeason?.id || null,
    };
  }, [registrations, users, progress, groups, seasons, exams]);

  const value = {
    hydrated,
    currentUser,
    supabaseSession,
    users,
    seasons,
    registrations,
    groups,
    progress,
    attendance,
    exams,
    notifications,
    stats,
    DEMO_PASSWORD,
    isSupabaseConfigured: isSupabaseConfigured(),
    login,
    logout,
    resetToSeedData,
    registerAccount,
    submitMemberApplication,
    activateInvite,
    activateSupervisorAccount,
    findRegistrationByPhone,
    resetPassword,
    confirmPasswordReset,
    createSeason,
    startNewSeason,
    updateSeason,
    setRegistrationOpen,
    activateSeason,
    announceRegistrationForm,
    submitSeasonRegistration,
    reviewRegistration,
    createGroup,
    updateGroup,
    deleteGroup,
    assignMemberToGroup,
    assignSupervisorToGroup,
    addSupervisor,
    removeSupervisor,
    addMember,
    saveAttendance,
    updateMemberProgress,
    updateMemberHifzGoal,
    getMemberPrograms,
    saveMemberProgram,
    deleteMemberProgram,
    updateMemberProgramProgress,
    addProgressNote,
    addExamResult,
    createExam,
    cancelExam,
    markExamCompleted,
    sendAlert,
    getNotificationsForUser,
    markNotificationRead,
    getUserById,
    getSupervisors,
    getMemberGroup,
    getMemberProgress,
    getActiveRegularSeason: () => getActiveRegularSeason(seasons),
    getSupervisorGroups,
  };

  if (!hydrated) {
    return (
      <View style={bootStyles.boot}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const bootStyles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
});

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useApp must be used within AppProvider");
  }
  return ctx;
}
