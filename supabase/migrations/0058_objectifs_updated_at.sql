-- 0058_objectifs_updated_at.sql
alter table public.objectifs
  add column updated_at timestamptz not null default now();