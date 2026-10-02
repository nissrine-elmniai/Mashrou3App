-- 0093_test_dates_heure.sql
-- Heure proposée pour chaque date de test.
-- Nullable : les dates déjà enregistrées restent valides.
-- L'interface exige l'heure pour toute nouvelle date.

begin;

alter table public.test_dates
  add column if not exists heure_proposee time;

notify pgrst, 'reload schema';

commit;

-- Vérification post-migration (à lancer à part) :
--
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'test_dates'
--   and column_name = 'heure_proposee';
