-- 0100 — codes OTP d'activation (preuve de possession de l'e-mail).
-- L'invité reçoit un code à 6 chiffres avant la création du compte Auth.
-- La table n'est lisible que par le service role (Edge Functions).
-- Aucune policy : anon et authenticated n'ont aucun accès.
-- service_role / postgres contournent la RLS.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

begin;

create table if not exists public.activation_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  role text not null check (role in ('member', 'supervisor')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now()
);

create index if not exists activation_codes_email_role_idx
  on public.activation_codes (email, role, created_at desc);

alter table public.activation_codes enable row level security;

revoke all on table public.activation_codes from public, anon, authenticated;
grant all on table public.activation_codes to postgres, service_role;

notify pgrst, 'reload schema';

commit;
