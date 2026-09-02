-- MIGRATION 0039 — colonne version (numéro) sur saisons
-- Remplace la date de fin pour les nouveaux musims ordinaires.

alter table public.saisons add column if not exists version integer;

alter table public.saisons drop constraint if exists saisons_version_positive;
alter table public.saisons add constraint saisons_version_positive
  check (version is null or version >= 1);

notify pgrst, 'reload schema';
