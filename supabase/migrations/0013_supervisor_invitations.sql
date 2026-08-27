-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0013 — supervisor_invitations (invitations superviseurs)
-- À exécuter après supabase/migrations/0012_tests_statut.sql
--
-- BUT : matérialiser côté serveur les invitations de superviseurs émises
-- par l'admin (auparavant mock local AppContext + fiche locale sans aucune
-- écriture Supabase). Le compte Auth n'existe pas encore à l'invitation :
-- la fiche porte l'état de la procédure (pending -> activated -> revoked).
-- Un profil superviseur réel n'est créé qu'au premier « إنشاء حساب » de
-- l'invité (signUpWithProfile depuis l'app) — le trigger
-- link_supervisor_invitation_on_profile (calqué sur
-- link_member_application_on_profile de 0001) bascule alors l'invitation
-- en 'activated'.
--
-- CONTRAINTE ANTI-DOUBLON (décision validée) : index unique PARTIEL sur
-- lower(email) WHERE status <> 'revoked' — au plus une invitation « en
-- cours » (pending ou activated) par adresse. Sans lui, deux invitations
-- actives pour le même email rendraient AMBIGU le trigger d'activation
-- (lequel choisir ?). La violation 23505 est détectée côté JS et affichée
-- proprement.

create table if not exists public.supervisor_invitations (
  id text primary key,
  email text not null,
  first_name text,
  last_name text,
  group_name text,
  status text not null default 'pending'
    check (status in ('pending', 'activated', 'revoked')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supervisor_invitations_email_idx
  on public.supervisor_invitations (lower(email));

create unique index if not exists supervisor_invitations_email_active_unique
  on public.supervisor_invitations (lower(email))
  where status <> 'revoked';

alter table public.supervisor_invitations enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.supervisor_invitations
  to authenticated;

-- RLS : admin uniquement (l'invité n'a pas encore de compte ; le trigger
-- d'activation est security definer et n'est pas soumis à RLS).
drop policy if exists "supervisor_invitations_admin_all" on public.supervisor_invitations;
create policy "supervisor_invitations_admin_all"
  on public.supervisor_invitations
  for all
  using (private.is_admin())
  with check (private.is_admin());

-- Activation automatique de l'invitation quand un profil superviseur est
-- créé avec le même email (premier « إنشاء حساب » de l'invité). Même
-- pattern que link_member_application_on_profile (0001) : security definer,
-- set search_path = public.
create or replace function public.link_supervisor_invitation_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'supervisor' and new.email is not null then
    update public.supervisor_invitations
    set
      status = 'activated',
      updated_at = now()
    where lower(email) = lower(new.email)
      and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_link_supervisor_invitation on public.profiles;
create trigger on_profile_link_supervisor_invitation
  after insert or update of email, role on public.profiles
  for each row execute function public.link_supervisor_invitation_on_profile();

-- Rechargement du cache de schéma PostgREST.
notify pgrst, 'reload schema';

-- Vérification (SQL Editor) :
--   select * from public.supervisor_invitations order by created_at desc;
