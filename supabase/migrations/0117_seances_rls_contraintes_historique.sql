-- 0117 — Séances : droits superviseur, horaires obligatoires, FK superviseur, historique atomique

-- 1. Le superviseur ne crée, ne modifie ni ne supprime sa séance (CRUD séances = admin).
--    seances_select_own est conservée ; superviseur_lit_ses_seances est un doublon exact.
drop policy if exists seances_insert_own on public.seances;
drop policy if exists seances_update_own on public.seances;
drop policy if exists seances_delete_own on public.seances;
drop policy if exists superviseur_lit_ses_seances on public.seances;

-- 2. Horaires obligatoires (prérequis de la fenêtre de présence).
alter table public.seances alter column heure_debut set not null;
alter table public.seances alter column heure_fin set not null;

-- 3. FK superviseur : la suppression d'un superviseur qui a une séance est refusée
--    explicitement (avant : SET NULL contredit par NOT NULL → 23502).
alter table public.seances drop constraint seances_superviseur_id_fkey;
alter table public.seances
  add constraint seances_superviseur_id_fkey
  foreign key (superviseur_id) references public.profiles(id) on delete restrict;

-- 4. Historique des horaires écrit par le serveur, dans la même transaction que l'UPDATE.
create or replace function private.seances_record_planning_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ancienne version de l'app : elle écrit elle-même l'historique
  -- et avance planning_valide_depuis. On ne double pas la ligne.
  if new.planning_valide_depuis is distinct from old.planning_valide_depuis then
    return new;
  end if;

  insert into public.seance_planning_history
    (seance_id, jour, heure_debut, heure_fin, valide_depuis, valide_jusqu_a)
  values
    (old.id, old.jour, old.heure_debut, old.heure_fin,
     old.planning_valide_depuis, pg_catalog.now());

  new.planning_valide_depuis := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.seances_record_planning_history() from public, anon, authenticated;

drop trigger if exists seances_record_planning_history on public.seances;
create trigger seances_record_planning_history
  before update of jour, heure_debut, heure_fin on public.seances
  for each row
  when (
    old.jour is distinct from new.jour
    or old.heure_debut is distinct from new.heure_debut
    or old.heure_fin is distinct from new.heure_fin
  )
  execute function private.seances_record_planning_history();

notify pgrst, 'reload schema';