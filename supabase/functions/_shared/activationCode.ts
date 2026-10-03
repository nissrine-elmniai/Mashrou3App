const PEPPER_FALLBACK = "mashrou3-activation-code";

export function canonicalActivationEmail(email: string) {
  const mail = String(email || "").trim().toLowerCase();
  if (!mail) return "";
  return mail.replace(/\+supervisor(?=@)/i, "");
}

export function generateActivationCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

function pepper() {
  return (
    Deno.env.get("ACTIVATION_CODE_PEPPER") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    PEPPER_FALLBACK
  );
}

export async function hashActivationCode(
  email: string,
  role: string,
  code: string
): Promise<string> {
  const data = new TextEncoder().encode(`${pepper()}|${email}|${role}|${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}
