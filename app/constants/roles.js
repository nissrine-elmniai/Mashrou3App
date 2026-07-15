export const ROLES = {
  ADMIN: "admin",
  SUPERVISOR: "supervisor",
  MEMBER: "member",
};

export const ROLE_LABELS = {
  admin: "مسؤول لجنة المسجد",
  supervisor: "مسؤول فرعي",
  member: "عضو",
};

export const DASHBOARD_BY_ROLE = {
  admin: "AdminDashboard",
  supervisor: "SupervisorDashboard",
  member: "MemberDashboardScreen",
};

export const SEASON_TYPES = {
  REGULAR: "regular",
  SUMMER: "summer",
};

export const SEASON_TYPE_LABELS = {
  regular: "موسم عادي",
  summer: "مدرسة صيفية",
};

export const REGISTRATION_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
};

export const REGISTRATION_STATUS_LABELS = {
  pending: "في انتظار المعالجة",
  accepted: "مقبول",
  rejected: "مرفوض",
};

export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  ABSENT: "absent",
  UNSET: "unset",
};
