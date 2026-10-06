-- 0121_season_stats_versionnee.sql
-- Versionne public.season_stats (créée hors dépôt, décrite seulement par
-- migrations_duplicates/0043 et 0044) et la rattache à public.saisons.
--
-- Schéma confirmé en base : ne pas modifier les types des colonnes déjà
-- présentes. CREATE TABLE IF NOT EXISTS ne réécrit pas une table existante.
--
-- Lecture : aucun code hors admin ne lit season_stats (seul app/lib/seasonStatsApi.js,
-- appelé par l'écran admin et par le snapshot de fin de saison). La policy
-- SELECT ouverte à tout authenticated est donc retirée.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

create table if not exists public.season_stats (
  saison_id text primary key,
  members_total integer not null default 0,
  members_male integer not null default 0,
  members_female integer not null default 0,
  seances_total integer not null default 0,
  supervisors_total integer not null default 0,
  avg_progress_pct numeric not null default 0,
  avg_presence_pct numeric not null default 0,
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index if not exists season_stats_snapshot_idx
  on public.season_stats (snapshot_at desc);

-- Orphelins (ex. s_1788706906070_1161) : aucune ligne saisons correspondante.
-- Sans ce DELETE, la clé étrangère ci-dessous échoue.
delete from public.season_stats ss
where not exists (
  select 1
  from public.saisons z
  where z.id = ss.saison_id
);

alter table public.season_stats
  drop constraint if exists season_stats_saison_id_fkey;

alter table public.season_stats
  add constraint season_stats_saison_id_fkey
  foreign key (saison_id) references public.saisons (id)
  on delete cascade;

alter table public.season_stats enable row level security;

-- L'ancienne lecture « tout utilisateur connecté » est retirée : pas d'appelant non-admin.
drop policy if exists season_stats_admin_all on public.season_stats;
drop policy if exists season_stats_select_authenticated on public.season_stats;

-- private.is_admin() (0026) : roles[] s'il est renseigné, sinon role.
create policy season_stats_admin_all
  on public.season_stats
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

grant select, insert, update, delete on table public.season_stats to authenticated;

notify pgrst, 'reload schema';
