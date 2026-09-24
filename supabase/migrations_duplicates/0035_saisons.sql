-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0035 — table saisons + saison_id sur supervisor_invitations
-- À exécuter après supabase/migrations/0034_season_scoped_inscriptions.sql
--
-- Les identifiants de musim sont du TEXT côté app (ex. s_bootstrap, s_173…)
-- comme seances.saison_id et inscriptions.saison_id — pas des UUID.
-- Pas de clé étrangère seances → saisons (référence logique texte uniquement).

-- Nettoyage d'une exécution partielle échouée
alter table public.supervisor_invitations
  drop constraint if exists supervisor_invitations_saison_id_fkey;
alter table public.supervisor_invitations
  drop column if exists saison_id;

-- Supprime toute FK pointant vers public.saisons (ex. seances_saison_id_fkey)
do $$
declare
  r record;
begin
  for r in
    select
      tc.table_name,
      tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
      and ccu.table_schema = tc.table_schema
    where tc.table_schema = 'public'
      and tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_name = 'saisons'
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      r.table_name,
      r.constraint_name
    );
  end loop;
end $$;

-- Si saisons a id uuid (schéma incompatible), on la recrée en text
do $$
declare
  id_type text;
begin
  select c.data_type
    into id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'saisons'
    and c.column_name = 'id';

  if id_type = 'uuid' then
    drop table public.saisons;
  end if;
end $$;

create table if not exists public.saisons (
  id text primary key,
  name text not null,
  type text not null default 'regular'
    check (type in ('regular', 'summer')),
  start_date text,
  end_date text,
  registration_open boolean not null default false,
  active boolean not null default true,
  remote boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Alignement si la table existait déjà sans toutes les colonnes
alter table public.saisons add column if not exists name text;
alter table public.saisons add column if not exists type text not null default 'regular';
alter table public.saisons add column if not exists start_date text;
alter table public.saisons add column if not exists end_date text;
alter table public.saisons add column if not exists registration_open boolean not null default false;
alter table public.saisons add column if not exists active boolean not null default true;
alter table public.saisons add column if not exists remote boolean not null default false;
alter table public.saisons add column if not exists created_at timestamptz not null default now();
alter table public.saisons add column if not exists updated_at timestamptz not null default now();

update public.saisons set type = 'regular' where type is null;
update public.saisons set registration_open = false where registration_open is null;
update public.saisons set active = true where active is null;
update public.saisons set remote = false where remote is null;

create index if not exists saisons_type_active_idx
  on public.saisons (type, active);

alter table public.saisons enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.saisons to authenticated;

drop policy if exists "saisons_admin_all" on public.saisons;
create policy "saisons_admin_all"
  on public.saisons
  for all
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "saisons_select_active_public" on public.saisons;
create policy "saisons_select_active_public"
  on public.saisons for select
  using (active = true or registration_open = true);

alter table public.supervisor_invitations
  add column if not exists saison_id text;

create index if not exists supervisor_invitations_saison_idx
  on public.supervisor_invitations (saison_id);

-- seances.saison_id reste text sans FK (cohérent avec l'app)
alter table public.seances
  drop constraint if exists seances_saison_id_fkey;

notify pgrst, 'reload schema';
