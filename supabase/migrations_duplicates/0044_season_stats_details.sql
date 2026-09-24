-- MIGRATION 0044 — détails graphiques figés avec le snapshot saison
-- bySeance / bySupervisor / progressTimeline (JSONB)

alter table public.season_stats
  add column if not exists details jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
