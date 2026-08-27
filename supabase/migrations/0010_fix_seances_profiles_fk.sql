-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0010 — FK manquantes seances.superviseur_id / progression.membre_id
--                  -> profiles.id
-- À exécuter après supabase/migrations/0009_fix_rls_recursion.sql
--
-- PROBLÈME (constaté sur la base distante le 2026-08-16 par introspection
-- PostgREST via la clé anon — GET /rest/v1/seances?select=superviseur:profiles(...)) :
--   seances     : "Could not find a relationship between 'seances' and
--                  'profiles' in the schema cache" (PGRST200, hint
--                  'seances_superviseur_id_fkey' introuvable)
--   progression : idem avec le hint 'progression_membre_id_fkey'
-- La colonne superviseur_id existe sur seances (les requêtes simples
-- passent jusqu'à l'étape des privilèges : 42501, pas PGRST200), mais
-- AUCUNE contrainte FK ne la relie à profiles.
--
-- CAUSE : les tables préexistaient à la consolidation des migrations ;
-- "create table if not exists" (0002 et 0004) a silencieusement ignoré la
-- déclaration inline "references public.profiles(id)" quand la table
-- existait déjà — les FK n'ont donc jamais été créées sur la base réelle.
-- (Les FK de messages — 0006 — existent bien : le parse des embeds
-- sender/recipient réussit, vérifié par la même introspection.)
--
-- FIX : création des contraintes sous le NOM EXACT attendu par les hints
-- PostgREST du frontend :
--   app/lib/messagesApi.js  : profiles!seances_superviseur_id_fkey(...)
--   app/lib/progressApi.js  : profiles!progression_membre_id_fkey(...)
-- Le bloc DO retire d'abord proprement toute FK existante entre ces tables
-- et profiles sous un AUTRE nom (recensée dynamiquement, aucun nom assumé),
-- et les "drop constraint if exists" rendent la migration ré-applicable.

-- ===========================================================================
-- 1) seances.superviseur_id -> profiles.id (on delete set null, cf. 0002)
-- ===========================================================================
do $$
declare
  v_conname text;
begin
  for v_conname in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.seances'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table public.seances drop constraint %I', v_conname);
    raise notice 'FK supprimée sur seances : %', v_conname;
  end loop;
end $$;

alter table public.seances
  drop constraint if exists seances_superviseur_id_fkey;

alter table public.seances
  add constraint seances_superviseur_id_fkey
  foreign key (superviseur_id) references public.profiles(id)
  on delete set null;

-- ===========================================================================
-- 2) progression.membre_id -> profiles.id (on delete cascade, cf. 0004)
--    Bug symétrique avéré : même classe de cause, même correctif.
-- ===========================================================================
do $$
declare
  v_conname text;
begin
  for v_conname in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.progression'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table public.progression drop constraint %I', v_conname);
    raise notice 'FK supprimée sur progression : %', v_conname;
  end loop;
end $$;

alter table public.progression
  drop constraint if exists progression_membre_id_fkey;

alter table public.progression
  add constraint progression_membre_id_fkey
  foreign key (membre_id) references public.profiles(id)
  on delete cascade;

-- ===========================================================================
-- Rechargement du cache de schéma PostgREST (l'erreur PGRST200 persisterait
-- sinon jusqu'au prochain reload automatique).
-- ===========================================================================
notify pgrst, 'reload schema';

-- Vérification (SQL Editor) — doit lister exactement deux lignes :
--   seances_superviseur_id_fkey   | seances      | profiles
--   progression_membre_id_fkey    | progression  | profiles
-- select con.conname, con.conrelid::regclass as t, con.confrelid::regclass as ref
-- from pg_constraint con
-- where con.contype = 'f'
--   and con.conrelid in ('public.seances'::regclass, 'public.progression'::regclass)
--   and con.confrelid = 'public.profiles'::regclass;
