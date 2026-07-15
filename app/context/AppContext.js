import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { DEMO_PASSWORD, emptyState, bootstrapUsers } from "../data/seed";
import { loadAppState, saveAppState } from "../data/storage";
import {
  DASHBOARD_BY_ROLE,
  REGISTRATION_STATUS,
  ROLES,
} from "../constants/roles";
import { colors } from "../constants/theme";

const AppContext = createContext(null);

const uid = (prefix) =>
  `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "/");
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
  const [currentUser, setCurrentUser] = useState(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    (async () => {
      const saved = await loadAppState();
      if (saved) {
        const loadedUsers =
          Array.isArray(saved.users) && saved.users.length > 0
            ? saved.users
            : bootstrapUsers;
        setUsers(loadedUsers);
        setSeasons(saved.seasons || []);
        setRegistrations(saved.registrations || []);
        setGroups(saved.groups || []);
        setProgress(saved.progress || []);
        setAttendance(saved.attendance || []);
        setExams(saved.exams || []);
        setNotifications(saved.notifications || []);
        if (saved.currentUserId) {
          const sessionUser = loadedUsers.find(
            (u) => u.id === saved.currentUserId
          );
          if (sessionUser) setCurrentUser(sessionUser);
        }
      }
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
    currentUser,
  ]);

  // garder currentUser synchronisé si le profil change
  useEffect(() => {
    if (!currentUser) return;
    const fresh = users.find((u) => u.id === currentUser.id);
    if (fresh && fresh !== currentUser) setCurrentUser(fresh);
  }, [users]);

  const login = (email, password) => {
    const user = users.find(
      (u) =>
        u.email.toLowerCase() === email.trim().toLowerCase() &&
        u.password === password
    );
    if (!user) {
      return { ok: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
    }
    setCurrentUser(user);
    return { ok: true, user, dashboard: DASHBOARD_BY_ROLE[user.role] };
  };

  const logout = () => setCurrentUser(null);

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
    };
    setUsers((prev) => [...prev, user]);
    return { ok: true, user };
  };

  const resetPassword = (email, newPassword) => {
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
    pushNotification({
      title: "إعلان استمارة التسجيل",
      body: `الاستمارة مفتوحة الآن: ${season.name}. سجّل عبر لوحة العضو.`,
      audience: "members",
    });
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
      pushNotification({
        title: "فتح باب التسجيل",
        body: `تم فتح استمارة: ${season.name}`,
        audience: "members",
      });
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
      userId,
      seasonId,
      freeTimes,
      status: REGISTRATION_STATUS.PENDING,
      createdAt: todayStr(),
    };
    setRegistrations((prev) => [...prev, registration]);
    pushNotification({
      title: "طلب تسجيل جديد",
      body: "وصل طلب تسجيل من عضو — راجعه من طلبات التسجيل",
      audience: "admin",
    });
    return { ok: true, registration };
  };

  const reviewRegistration = (registrationId, status) => {
    const reg = registrations.find((r) => r.id === registrationId);
    setRegistrations((prev) =>
      prev.map((r) => (r.id === registrationId ? { ...r, status } : r))
    );
    if (reg) {
      pushNotification({
        title:
          status === REGISTRATION_STATUS.ACCEPTED
            ? "تم قبول طلبك"
            : "تم رفض طلبك",
        body:
          status === REGISTRATION_STATUS.ACCEPTED
            ? "تم قبول طلب التسجيل. ستُوزّع على مجموعة قريباً."
            : "لم يتم قبول طلب التسجيل هذه المرة.",
        audience: "user",
        userId: reg.userId,
      });
    }
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

  const addSupervisor = ({
    firstName,
    lastName,
    email,
    password = "123456",
    birthDate = "2000/01/01",
    gender = "ذكر",
    groupId,
    newGroup,
  }) => {
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return { ok: false, error: "املأ الاسم واللقب والبريد" };
    }
    if (!groupId && !newGroup?.name?.trim()) {
      return {
        ok: false,
        error: "يجب تحديد المجموعة المعنية بهذا المشرف",
      };
    }
    if (
      users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    ) {
      return { ok: false, error: "هذا البريد مستخدم مسبقاً" };
    }

    let assignedGroup = null;
    let pendingNewGroup = null;
    if (groupId) {
      assignedGroup = groups.find((g) => g.id === groupId);
      if (!assignedGroup) {
        return { ok: false, error: "المجموعة المحددة غير موجودة" };
      }
    } else if (newGroup?.name?.trim()) {
      const seasonId =
        newGroup.seasonId ||
        seasons.find((s) => s.active)?.id ||
        seasons[0]?.id;
      if (!seasonId) {
        return {
          ok: false,
          error: "لا يوجد موسم لإنشاء المجموعة — أنشئ موسماً أولاً",
        };
      }
      pendingNewGroup = {
        id: uid("g"),
        seasonId,
        name: newGroup.name.trim(),
        freeTimeSlot: newGroup.freeTimeSlot || "",
        supervisorId: null,
        memberIds: [],
        schedule: newGroup.schedule || "",
        remote: !!newGroup.remote,
      };
    }

    const user = {
      id: uid("u"),
      email: email.trim().toLowerCase(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      gender,
      role: ROLES.SUPERVISOR,
    };
    setUsers((prev) => [...prev, user]);

    if (groupId) {
      assignSupervisorToGroup(groupId, user.id);
    } else if (pendingNewGroup) {
      assignedGroup = { ...pendingNewGroup, supervisorId: user.id };
      setGroups((prev) => [...prev, assignedGroup]);
    }

    pushNotification({
      title: "حساب مشرف جديد",
      body: `تم إنشاء حسابك: ${user.email}`,
      audience: "user",
      userId: user.id,
    });

    return { ok: true, user, group: assignedGroup };
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

  const sendAlert = (text) => {
    const body = (text || "").trim();
    if (!body) return { ok: false, error: "اكتب نص التنبيه أولاً" };
    pushNotification({
      title: "تنبيه من الإدارة",
      body,
      audience: "all",
    });
    return { ok: true };
  };

  const getNotificationsForUser = (user = currentUser) => {
    if (!user) return [];
    return notifications.filter((n) => {
      if (n.audience === "all") return true;
      if (n.audience === "user" && n.userId === user.id) return true;
      if (n.audience === "admin" && user.role === ROLES.ADMIN) return true;
      if (n.audience === "members" && user.role === ROLES.MEMBER) {
        return true;
      }
      if (
        n.audience === "supervisors" &&
        user.role === ROLES.SUPERVISOR
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
    users.filter((u) => u.role === ROLES.SUPERVISOR);

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
    const pendingRegs = registrations.filter(
      (r) => r.status === REGISTRATION_STATUS.PENDING
    ).length;
    const members = users.filter((u) => u.role === ROLES.MEMBER).length;
    const supervisors = users.filter(
      (u) => u.role === ROLES.SUPERVISOR
    ).length;
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
      groups: groups.length,
      seasons: seasons.length,
      avgProgress,
      exams: exams.length,
    };
  }, [registrations, users, progress, groups, seasons, exams]);

  const value = {
    hydrated,
    currentUser,
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
    login,
    logout,
    registerAccount,
    resetPassword,
    createSeason,
    updateSeason,
    setRegistrationOpen,
    activateSeason,
    announceRegistrationForm,
    submitSeasonRegistration,
    reviewRegistration,
    createGroup,
    assignMemberToGroup,
    assignSupervisorToGroup,
    addSupervisor,
    addMember,
    saveAttendance,
    updateMemberProgress,
    addProgressNote,
    addExamResult,
    sendAlert,
    getNotificationsForUser,
    markNotificationRead,
    getUserById,
    getSupervisors,
    getMemberGroup,
    getMemberProgress,
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
