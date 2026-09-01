-- MIGRATION 0038 — colonnes created_at / updated_at sur seances (si absentes)
-- À exécuter après 0037_backfill_seances_saison_id.sql

alter table public.seances
  add column if not exists created_at timestamptz not null default now();

alter table public.seances
  add column if not exists updated_at timestamptz not null default now();

notify pgrst, 'reload schema';
