-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0005 — tables tests / test_invitations / test_resultats
-- À exécuter après supabase/migrations/0004_progression.sql
--
-- RLS : admin = tout sur les 3 tables ; superviseur = gestion des tests de
--       sa séance (création, invitations, résultats) ;
--       membre = lecture de ses propres invitations/résultats + mise à jour
--       de statut/date_choisie de sa propre invitation uniquement
--       (workflow confirme/refuse — la note est posée par le superviseur).

create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  seance_id uuid references public.seances (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ⬇️ AJOUT : colonnes manquantes si la table existait déjà
alter table public.tests add column if not exists seance_id uuid references public.seances (id);
alter table public.tests add column if not exists created_by uuid references public.profiles (id);

create table if not exists public.test_invitations (
  id uuid primary key default gen_random_uuid(),
  test_id uuid references public.tests (id) on delete cascade,
  membre_id uuid references public.profiles (id),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'confirme', 'refuse')),
  date_choisie date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ⬇️ AJOUT : colonnes manquantes si la table existait déjà
alter table public.test_invitations add column if not exists test_id uuid references public.tests (id) on delete cascade;
alter table public.test_invitations add column if not exists membre_id uuid references public.profiles (id);
alter table public.test_invitations add column if not exists statut text not null default 'en_attente' check (statut in ('en_attente', 'confirme', 'refuse'));
alter table public.test_invitations add column if not exists date_choisie date;

create table if not exists public.test_resultats (
  id uuid primary key default gen_random_uuid(),
  test_invitation_id uuid references public.test_invitations (id) on delete cascade,
  note numeric,
  commentaire text,
  noted_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ⬇️ AJOUT : colonnes manquantes si la table existait déjà
alter table public.test_resultats add column if not exists test_invitation_id uuid references public.test_invitations (id) on delete cascade;
alter table public.test_resultats add column if not exists note numeric;
alter table public.test_resultats add column if not exists commentaire text;
alter table public.test_resultats add column if not exists noted_by uuid references public.profiles (id);

create index if not exists test_invitations_membre_idx on public.test_invitations (membre_id);
create index if not exists test_invitations_test_idx on public.test_invitations (test_id);
create index if not exists test_resultats_invitation_idx on public.test_resultats (test_invitation_id);

alter table public.tests enable row level security;
alter table public.test_invitations enable row level security;
alter table public.test_resultats enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.tests to authenticated;
grant select, insert, update, delete on table public.test_invitations to authenticated;
grant select, insert, update, delete on table public.test_resultats to authenticated;

-- ===========================================================================
-- TESTS
-- ===========================================================================

-- Admin : tout
drop policy if exists "tests_admin_all" on public.tests;
create policy "tests_admin_all"
  on public.tests
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Superviseur : lecture des tests des séances qui lui appartiennent
drop policy if exists "tests_select_superviseur" on public.tests;
create policy "tests_select_superviseur"
  on public.tests for select
  using (
    exists (
      select 1 from public.seances s
      where s.id = tests.seance_id
        and s.superviseur_id = auth.uid()
    )
  );

-- Superviseur : écriture (insert/update/delete) des tests de ses séances
drop policy if exists "tests_write_superviseur" on public.tests;
create policy "tests_write_superviseur"
  on public.tests
  for all
  using (
    exists (
      select 1 from public.seances s
      where s.id = tests.seance_id
        and s.superviseur_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.seances s
      where s.id = tests.seance_id
        and s.superviseur_id = auth.uid()
    )
  );

-- Membre : lecture du test auquel il est invité (jointure depuis
-- test_invitations -> tests)
drop policy if exists "tests_select_member_invited" on public.tests;
create policy "tests_select_member_invited"
  on public.tests for select
  using (
    exists (
      select 1 from public.test_invitations ti
      where ti.test_id = tests.id
        and ti.membre_id = auth.uid()
    )
  );

-- ===========================================================================
-- TEST_INVITATIONS
-- ===========================================================================

-- Admin : tout
drop policy if exists "test_invitations_admin_all" on public.test_invitations;
create policy "test_invitations_admin_all"
  on public.test_invitations
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Membre : lecture de ses propres invitations
drop policy if exists "test_invitations_select_own_member" on public.test_invitations;
create policy "test_invitations_select_own_member"
  on public.test_invitations for select
  using (membre_id = auth.uid());

-- Membre : mise à jour de sa propre invitation (statut / date_choisie —
-- les autres colonnes sont verrouillées par le trigger de garde ci-dessous)
drop policy if exists "test_invitations_update_own_member" on public.test_invitations;
create policy "test_invitations_update_own_member"
  on public.test_invitations for update
  using (membre_id = auth.uid())
  with check (membre_id = auth.uid());

-- Garde-fou : un membre ne peut modifier que statut et date_choisie sur sa
-- propre invitation. Tout changement de test_id / membre_id / created_at
-- est rejeté. (Une policy RLS ne peut pas restreindre des colonnes ; on
-- verrouille donc au niveau trigger, uniquement quand l'auteur est membre.)
create or replace function public.guard_test_invitation_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select role from public.profiles where id = auth.uid()) = 'member'
     and (
       new.test_id is distinct from old.test_id
       or new.membre_id is distinct from old.membre_id
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'Un membre ne peut modifier que le statut et la date de son invitation de test';
  end if;
  return new;
end;
$$;

drop trigger if exists test_invitations_member_update_guard on public.test_invitations;
create trigger test_invitations_member_update_guard
  before update on public.test_invitations
  for each row execute function public.guard_test_invitation_member_update();

-- Superviseur : lecture des invitations des tests de ses séances
drop policy if exists "test_invitations_select_superviseur" on public.test_invitations;
create policy "test_invitations_select_superviseur"
  on public.test_invitations for select
  using (
    exists (
      select 1
      from public.tests t
      join public.seances s on s.id = t.seance_id
      where t.id = test_invitations.test_id
        and s.superviseur_id = auth.uid()
    )
  );

-- Superviseur : écriture (insert/update/delete) des invitations des tests
-- de ses séances
drop policy if exists "test_invitations_write_superviseur" on public.test_invitations;
create policy "test_invitations_write_superviseur"
  on public.test_invitations
  for all
  using (
    exists (
      select 1
      from public.tests t
      join public.seances s on s.id = t.seance_id
      where t.id = test_invitations.test_id
        and s.superviseur_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tests t
      join public.seances s on s.id = t.seance_id
      where t.id = test_invitations.test_id
        and s.superviseur_id = auth.uid()
    )
  );

-- ===========================================================================
-- TEST_RESULTATS
-- ===========================================================================

-- Admin : tout
drop policy if exists "test_resultats_admin_all" on public.test_resultats;
create policy "test_resultats_admin_all"
  on public.test_resultats
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Membre : lecture de ses propres résultats (via ses invitations)
drop policy if exists "test_resultats_select_own_member" on public.test_resultats;
create policy "test_resultats_select_own_member"
  on public.test_resultats for select
  using (
    exists (
      select 1 from public.test_invitations ti
      where ti.id = test_resultats.test_invitation_id
        and ti.membre_id = auth.uid()
    )
  );

-- Superviseur : lecture des résultats des tests de ses séances
drop policy if exists "test_resultats_select_superviseur" on public.test_resultats;
create policy "test_resultats_select_superviseur"
  on public.test_resultats for select
  using (
    exists (
      select 1
      from public.test_invitations ti
      join public.tests t on t.id = ti.test_id
      join public.seances s on s.id = t.seance_id
      where ti.id = test_resultats.test_invitation_id
        and s.superviseur_id = auth.uid()
    )
  );

-- Superviseur : écriture (insert/update/delete) des résultats des tests de
-- ses séances
drop policy if exists "test_resultats_write_superviseur" on public.test_resultats;
create policy "test_resultats_write_superviseur"
  on public.test_resultats
  for all
  using (
    exists (
      select 1
      from public.test_invitations ti
      join public.tests t on t.id = ti.test_id
      join public.seances s on s.id = t.seance_id
      where ti.id = test_resultats.test_invitation_id
        and s.superviseur_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.test_invitations ti
      join public.tests t on t.id = ti.test_id
      join public.seances s on s.id = t.seance_id
      where ti.id = test_resultats.test_invitation_id
        and s.superviseur_id = auth.uid()
    )
  );