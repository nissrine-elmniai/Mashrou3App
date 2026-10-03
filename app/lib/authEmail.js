/** E-mail affiché / invitations (sans suffixe rôle). */
export function canonicalEmail(email) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail) return "";
  return mail.replace(/\+supervisor(?=@)/i, "");
}

export function isSupervisorAuthEmail(email) {
  return /\+supervisor@/i.test(String(email || ""));
}

/** Adresse affichée : colonne canonical_email, sinon email Auth. */
export function displayProfileEmail(profile) {
  const canonical = String(profile?.canonical_email || "").trim();
  if (canonical) return canonical;
  return String(profile?.email || "").trim();
}
