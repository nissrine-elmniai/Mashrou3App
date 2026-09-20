-- 0080_saisons_archive_on_deactivate.sql
-- Cycle de vie des saisons : empêcher la récidive
-- (saison active = false avec séances encore statut = 'active',
--  ou registration_open = true). Aucune purge de données.
--
-- NE PAS EXÉCUTER avant les requêtes de pré-vérification ci-dessous.
-- Données du 19 sept. 2026 : A, B et C étaient vides.
--
-- ---------------------------------------------------------------------------
-- AVANT d'exécuter cette migration (lecture seule)
-- ---------------------------------------------------------------------------
--
-- A. Plusieurs saisons actives du même type
--    (CREATE UNIQUE INDEX échoue s'il reste plus d'une ligne par type)
--
-- select type, count(*) as n, array_agg(id order by id) as ids
-- from public.saisons
-- where active = true
-- group by type
-- having count(*) > 1;
--
-- B. Inscriptions ouvertes sur une saison inactive
--    (ADD CONSTRAINT CHECK échoue s'il reste des lignes)
--
-- select id, name, type, active, registration_open
-- from public.saisons
-- where registration_open = true
--   and active = false;
--
-- C. Séances encore 'active' rattachées à une saison inactive
--    (pas une contrainte : le trigger n'est PAS rétroactif.
--     Corriger à la main si besoin, avant ou après.)
--
-- select s.id as seance_id, s.nom, s.statut, s.saison_id,
--        z.name as saison_name, z.active as saison_active
-- from public.seances s
-- join public.saisons z on z.id = s.saison_id
-- where s.statut = 'active'
--   and z.active = false;
--
-- ---------------------------------------------------------------------------
-- APRÈS exécution
-- ---------------------------------------------------------------------------
--
-- select tgname, pg_get_triggerdef(t.oid)
-- from pg_trigger t
-- where t.tgrelid = 'public.saisons'::regclass
--   and not t.tgisinternal
-- order by tgname;
--
-- select conname, contype, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.saisons'::regclass
-- order by conname;
--
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename = 'saisons'
-- order by indexname;

begin;

-- (a) BEFORE UPDATE : active → false force registration_open = false,
--     sinon un `update saisons set active = false` casserait le CHECK (c).
create or replace function private.saisons_force_registration_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.active and not new.active then
    new.registration_open := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_saisons_force_registration_closed on public.saisons;
create trigger trg_saisons_force_registration_closed
  before update of active on public.saisons
  for each row
  when (old.active and not new.active)
  execute function private.saisons_force_registration_closed();

-- (b) AFTER UPDATE OF active : archiver les séances encore 'active'.
--     SECURITY DEFINER : l'UPDATE seances doit porter sur TOUTES les
--     séances de la saison, pas seulement celles du rôle courant
--     (seances_update_own = superviseur, dashboard SQL, etc.).
create or replace function private.saisons_archive_seances_on_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.seances
  set statut = 'archivee',
      updated_at = now()
  where saison_id = new.id
    and statut = 'active';
  return new;
end;
$$;

drop trigger if exists trg_saisons_archive_seances_on_deactivate on public.saisons;
create trigger trg_saisons_archive_seances_on_deactivate
  after update of active on public.saisons
  for each row
  when (old.active and not new.active)
  execute function private.saisons_archive_seances_on_deactivate();

revoke all on function private.saisons_force_registration_closed() from public;
revoke all on function private.saisons_archive_seances_on_deactivate() from public;

-- (c) Inscriptions ouvertes uniquement si la saison est active.
alter table public.saisons
  drop constraint if exists saisons_registration_requires_active;

alter table public.saisons
  add constraint saisons_registration_requires_active
  check (not registration_open or active);

-- (d) Une seule saison active par type (regular et summer peuvent coexister).
create unique index if not exists saisons_one_active_per_type
  on public.saisons (type)
  where active;

commit;

notify pgrst, 'reload schema';
