-- MIGRATION 0042 — date_debut / date_fin obligatoires côté app pour chaque séance
-- Période de validité de la séance (indépendante du planning hebdomadaire).

alter table public.seances
  add column if not exists date_debut date;

alter table public.seances
  add column if not exists date_fin date;

alter table public.seances drop constraint if exists seances_dates_order;
alter table public.seances add constraint seances_dates_order
  check (
    date_debut is null
    or date_fin is null
    or date_fin >= date_debut
  );

notify pgrst, 'reload schema';
