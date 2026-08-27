-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0012 — tests.statut (planifie / termine / annule)
-- À exécuter après supabase/migrations/0011_fix_inscriptions_select_own_member.sql
--
-- BUT : rendre le statut d'un test EXPLICITE. La clôture d'un test ne se
-- déduit pas de ses seuls résultats : un test annulé n'a aucun résultat,
-- et un test encore planifié peut déjà avoir des résultats partiels.
-- D'où une colonne dédiée, positionnée par l'admin ou le superviseur :
--   planifie (défaut) — teste clôturé -> termine — teste annulé -> annule.
--
-- Aucun changement de policy : tests_admin_all / tests_write_superviseur
-- (0009) couvrent déjà les mises à jour.

alter table public.tests
  add column if not exists statut text not null default 'planifie'
  check (statut in ('planifie', 'termine', 'annule'));

create index if not exists tests_statut_idx on public.tests (statut);

-- Rechargement du cache de schéma PostgREST (nouvelle colonne).
notify pgrst, 'reload schema';

-- Vérification (SQL Editor) :
--   select column_name, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'tests'
--   order by ordinal_position;
