-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0011 — RESTAURATION DE inscriptions_select_own_member
-- À exécuter après supabase/migrations/0010_fix_seances_profiles_fk.sql
--
-- PROBLÈME (constaté le 2026-08-16 par introspection RLS) :
--   inscriptions_select_own_member (membre : lecture de sa propre ligne,
--   créée en 0003) a été perdue silencieusement lors de la réécriture de
--   0009 : la re-création des policies de inscriptions dans 0009 ne
--   contient que inscriptions_admin_all, inscriptions_select_superviseur
--   et inscriptions_write_superviseur. Résultat : un membre ne peut plus
--   lire sa propre inscription (ni sa séance via la jointure
--   inscriptions -> seances utilisée par le frontend).
--
-- FIX : recréation à l'identique de la policy originale (0003) — clause
--   using (membre_id = auth.uid()), sans la moindre sous-requête vers une
--   autre table protégée par RLS (cohérent avec le pattern private.* de
--   0009 : aucune vérification cross-table à faire ici).

drop policy if exists "inscriptions_select_own_member" on public.inscriptions;
create policy "inscriptions_select_own_member"
  on public.inscriptions for select
  using (membre_id = auth.uid());

-- Rechargement du cache de schéma PostgREST.
notify pgrst, 'reload schema';

-- Vérification (SQL Editor) — doit lister 4 policies sur inscriptions :
--   inscriptions_admin_all, inscriptions_select_own_member,
--   inscriptions_select_superviseur, inscriptions_write_superviseur
-- select policyname from pg_policies
-- where schemaname = 'public' and tablename = 'inscriptions'
-- order by policyname;
