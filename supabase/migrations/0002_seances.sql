-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0002 — table seances (séances / groupes d'apprentissage)
-- À exécuter après supabase/migrations/0001_baseline.sql
--
-- RLS : superviseur = lecture/écriture de sa propre séance ;
--       admin = tout ; membre = lecture seule de la séance où il est inscrit.

create table if not exists public.seances (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  saison_id text,
  jour text,
  heure_debut time,
  heure_fin time,
  superviseur_id uuid references public.profiles (id) on delete set null,
  statut text not null default 'active'
    check (statut in ('active', 'archivee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seances_superviseur_idx on public.seances (superviseur_id);

alter table public.seances enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.seances to authenticated;

-- Admin : tout (même pattern que member_applications_admin_all)
drop policy if exists "seances_admin_all" on public.seances;
create policy "seances_admin_all"
  on public.seances
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

-- Superviseur : lecture de ses propres séances
drop policy if exists "seances_select_own" on public.seances;
create policy "seances_select_own"
  on public.seances for select
  using (superviseur_id = auth.uid());

-- Superviseur : création d'une séance qui lui est assignée
drop policy if exists "seances_insert_own" on public.seances;
create policy "seances_insert_own"
  on public.seances for insert
  with check (superviseur_id = auth.uid());

-- Superviseur : modification de ses propres séances
drop policy if exists "seances_update_own" on public.seances;
create policy "seances_update_own"
  on public.seances for update
  using (superviseur_id = auth.uid())
  with check (superviseur_id = auth.uid());

-- Superviseur : suppression de ses propres séances
drop policy if exists "seances_delete_own" on public.seances;
create policy "seances_delete_own"
  on public.seances for delete
  using (superviseur_id = auth.uid());

-- Membre : lecture seule de la séance à laquelle il est inscrit (statut 'accepte')
drop policy if exists "seances_select_member_inscrit" on public.seances;
create policy "seances_select_member_inscrit"
  on public.seances for select
  using (
    exists (
      select 1 from public.inscriptions i
      where i.seance_id = seances.id
        and i.membre_id = auth.uid()
        and i.statut = 'accepte'
    )
  );
