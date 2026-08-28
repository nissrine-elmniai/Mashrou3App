-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0023 — FK manquante inscriptions.membre_id -> profiles.id
-- À exécuter après supabase/migrations/0022_alerts_title_legacy.sql
--
-- PROBLÈME (constaté le 2026-08-28 par introspection PostgREST via clé anon,
-- login superviseur elaammarioumeima@gmail.com) :
--   GET inscriptions?select=membre:profiles!inscriptions_membre_id_fkey(...)
--   → PGRST200 : "Could not find a relationship between 'inscriptions' and
--     'profiles' using the hint 'inscriptions_membre_id_fkey'"
--   getSeanceMembers() échoue → bandeau mode dégradé sur le dashboard superviseur.
--
-- CAUSE : même classe que 0010 (tables préexistantes, create table if not exists
-- a ignoré la déclaration inline references profiles(id)). La colonne membre_id
-- existe et pointe bien vers profiles.id (UUID auth), mais aucune contrainte FK
-- nommée inscriptions_membre_id_fkey n'est enregistrée dans pg_constraint.
--
-- FIX : création de la contrainte sous le nom exact attendu par les hints
-- PostgREST du frontend :
--   app/lib/membersApi.js   : profiles!inscriptions_membre_id_fkey(...)
--   app/lib/seancesApi.js   : profiles!inscriptions_membre_id_fkey(...)

-- ===========================================================================
-- inscriptions.membre_id -> profiles.id (on delete cascade, cf. 0003)
-- ===========================================================================
do $$
declare
  v_conname text;
begin
  for v_conname in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.inscriptions'::regclass
      and con.contype = 'f'
      and con.confrelid = 'public.profiles'::regclass
  loop
    execute format('alter table public.inscriptions drop constraint %I', v_conname);
    raise notice 'FK supprimée sur inscriptions -> profiles : %', v_conname;
  end loop;
end $$;

alter table public.inscriptions
  drop constraint if exists inscriptions_membre_id_fkey;

alter table public.inscriptions
  add constraint inscriptions_membre_id_fkey
  foreign key (membre_id) references public.profiles(id)
  on delete cascade;

-- Rechargement du cache de schéma PostgREST (sinon PGRST200 persiste).
notify pgrst, 'reload schema';

-- Vérification (SQL Editor) :
-- select con.conname, con.conrelid::regclass as t, con.confrelid::regclass as ref
-- from pg_constraint con
-- where con.contype = 'f'
--   and con.conrelid = 'public.inscriptions'::regclass
--   and con.confrelid = 'public.profiles'::regclass;
-- → doit lister inscriptions_membre_id_fkey | inscriptions | profiles
