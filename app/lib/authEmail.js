import { ROLES } from "../constants/roles";

const SUPERVISOR_TAG = "+supervisor";

/** E-mail affiché / invitations (sans suffixe rôle). */
export function canonicalEmail(email) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail) return "";
  return mail.replace(/\+supervisor(?=@)/i, "");
}

export function isSupervisorAuthEmail(email) {
  return /\+supervisor@/i.test(String(email || ""));
}

/** E-mail réellement utilisé par Supabase Auth selon le rôle. */
export function authEmailForRole(email, role) {
  const canonical = canonicalEmail(email);
  if (!canonical || !canonical.includes("@")) return canonical;
  if (role === ROLES.SUPERVISOR) {
    const at = canonical.indexOf("@");
    const local = canonical.slice(0, at);
    const domain = canonical.slice(at + 1);
    if (local.toLowerCase().endsWith(SUPERVISOR_TAG)) {
      return canonical;
    }
    return `${local}${SUPERVISOR_TAG}@${domain}`;
  }
  return canonical;
}

export function resolveAuthEmail(email, preferredRole = null) {
  const canonical = canonicalEmail(email);
  if (preferredRole === ROLES.SUPERVISOR) {
    return authEmailForRole(canonical, ROLES.SUPERVISOR);
  }
  return canonical;
}

/**
 * E-mails Auth à essayer à la connexion (ordre = priorité).
 * Même e-mail affiché + même mot de passe = un seul compte (e-mail canonique).
 * Mot de passe différent = compte séparé (souvent e-mail +supervisor pour le superviseur).
 */
export function authEmailsForLogin(email, preferredRole = null) {
  const canonical = canonicalEmail(email);
  const supervisorMail = authEmailForRole(canonical, ROLES.SUPERVISOR);
  if (preferredRole === ROLES.SUPERVISOR) {
    const list = [supervisorMail];
    if (supervisorMail !== canonical) list.push(canonical);
    return list;
  }
  return [canonical];
}
