-- 0076 — suppression des tables héritées du CdC (jamais alimentées par l'app).
--
-- public.users       : ancienne fiche utilisateur (rôle FR). Remplacée par profiles.
-- public.membres     : ancienne fiche membre (genre, date_naissance). Remplacée par profiles.
-- public.superviseurs: ancienne fiche superviseur. Remplacée par profiles.role / roles[].
--
-- auth.users (schéma auth) n'est PAS touché.
-- DROP CASCADE retire les FK orphelines pointant encore vers ces tables.
-- Les FK métier (inscriptions / presences → profiles) sont rétablies ensuite.

drop table if exists public.membres cascade;
drop table if exists public.superviseurs cascade;
drop table if exists public.users cascade;

-- inscriptions.membre_id → profiles (0023)
do $$
begin
  if to_regclass('public.inscriptions') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.inscriptions'::regclass
         and conname = 'inscriptions_membre_id_fkey'
     ) then
    alter table public.inscriptions
      add constraint inscriptions_membre_id_fkey
      foreign key (membre_id) references public.profiles(id)
      on delete cascade;
  end if;
end $$;

-- presences.membre_id → profiles (0043)
do $$
begin
  if to_regclass('public.presences') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.presences'::regclass
         and conname = 'presences_membre_id_fkey'
     ) then
    alter table public.presences
      add constraint presences_membre_id_fkey
      foreign key (membre_id) references public.profiles(id)
      on delete cascade;
  end if;
end $$;

notify pgrst, 'reload schema';
