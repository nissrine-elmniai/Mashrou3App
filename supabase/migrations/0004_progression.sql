-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0004 — table progression (saisie personnelle du membre)
-- À exécuter après supabase/migrations/0003_inscriptions.sql
--
-- RLS : membre = CRUD sur ses propres lignes uniquement ;
--       superviseur = lecture des lignes des membres de sa séance ;
--       admin = lecture globale uniquement.

create table if not exists public.progression (
  id uuid primary key default gen_random_uuid(),
  membre_id uuid references public.profiles (id) on delete cascade,
  juze integer not null check (juze between 1 and 30),
  tumun integer check (tumun between 1 and 8),
  date_saisie date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.progression 
add column if not exists date_saisie date not null default current_date;

create index if not exists progression_membre_idx on public.progression (membre_id, date_saisie);

alter table public.progression enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.progression to authenticated;

-- Admin : lecture globale uniquement (pas d'écriture)
drop policy if exists "progression_admin_select" on public.progression;
create policy "progression_admin_select"
  on public.progression for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Membre : CRUD sur ses propres lignes uniquement
drop policy if exists "progression_select_own" on public.progression;
create policy "progression_select_own"
  on public.progression for select
  using (membre_id = auth.uid());

drop policy if exists "progression_insert_own" on public.progression;
create policy "progression_insert_own"
  on public.progression for insert
  with check (membre_id = auth.uid());

drop policy if exists "progression_update_own" on public.progression;
create policy "progression_update_own"
  on public.progression for update
  using (membre_id = auth.uid())
  with check (membre_id = auth.uid());

drop policy if exists "progression_delete_own" on public.progression;
create policy "progression_delete_own"
  on public.progression for delete
  using (membre_id = auth.uid());

-- Superviseur : lecture des progressions des membres inscrits ('accepte')
-- dans l'une de SES séances
drop policy if exists "progression_select_superviseur" on public.progression;
create policy "progression_select_superviseur"
  on public.progression for select
  using (
    exists (
      select 1
      from public.inscriptions i
      join public.seances s on s.id = i.seance_id
      where i.membre_id = progression.membre_id
        and s.superviseur_id = auth.uid()
    )
  );
