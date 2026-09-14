export const MIN_PASSWORD_LENGTH = 8;

export function isPasswordTooShort(password) {
  return String(password || "").length < MIN_PASSWORD_LENGTH;
}

export function passwordTooShortMessage() {
  return `كلمة المرور قصيرة جداً (${MIN_PASSWORD_LENGTH} أحرف على الأقل)`;
}
