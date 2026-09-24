-- MIGRATION 0043 — statistiques figées par musim (historique après clôture)
-- Snapshot généré avant la fermeture d'un musim, consultable ensuite.

create table if not exists public.season_stats (
  saison_id text primary key,
  members_total integer not null default 0,
  members_male integer not null default 0,
  members_female integer not null default 0,
  seances_total integer not null default 0,
  supervisors_total integer not null default 0,
  avg_progress_pct numeric(5, 2) not null default 0,
  avg_presence_pct numeric(5, 2) not null default 0,
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists season_stats_snapshot_idx
  on public.season_stats (snapshot_at desc);

alter table public.season_stats enable row level security;

grant select, insert, update, delete on table public.season_stats to authenticated;

drop policy if exists "season_stats_admin_all" on public.season_stats;
create policy "season_stats_admin_all"
  on public.season_stats
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

-- Lecture pour superviseurs / membres (consultation historique)
drop policy if exists "season_stats_select_authenticated" on public.season_stats;
create policy "season_stats_select_authenticated"
  on public.season_stats
  for select
  using (auth.uid() is not null);

notify pgrst, 'reload schema';
