-- 0108_progression_require_enrollment.sql
-- Interdit d'écrire une progression tant que le membre n'a aucune
-- inscription acceptée dans une saison active (tout type).
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
--
-- Colonnes réelles (vérifiées en base) : id, membre_id, saison_id,
-- date timestamptz, nb_hizb_completes, tumun_courant, notes, date_saisie.
-- Pas de created_at.

create or replace function private.progression_require_active_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- statut ::text : compatible avec inscription_statut_enum et avec text.
  if not exists (
    select 1
    from public.inscriptions i
    join public.saisons z on z.id = i.saison_id
    where i.membre_id = new.membre_id
      and i.statut::text = 'accepte'
      and z.active
  ) then
    raise exception 'لا يمكن تسجيل التقدم قبل التسجيل في الموسم الحالي';
  end if;
  return new;
end;
$$;

revoke all on function private.progression_require_active_enrollment() from public;
revoke all on function private.progression_require_active_enrollment() from anon;
revoke all on function private.progression_require_active_enrollment() from authenticated;
grant execute on function private.progression_require_active_enrollment() to postgres, service_role;

drop trigger if exists progression_require_active_enrollment on public.progression;
create trigger progression_require_active_enrollment
  before insert or update on public.progression
  for each row
  execute function private.progression_require_active_enrollment();

-- Test : un membre sans inscription ne peut pas insérer.
-- Le bloc intérieur annule l'insert (exception). Si le message n'est pas
-- celui attendu, l'exception remonte et la migration entière est annulée.
do $test$
begin
  begin
    insert into public.progression (
      membre_id, date, nb_hizb_completes, tumun_courant, date_saisie
    ) values (
      '00000000-0000-0000-0000-000000000000',
      pg_catalog.now(),
      0,
      0,
            current_date
    );
    raise exception 'TEST: insert accepté pour un membre non inscrit';
  exception
    when others then
      if sqlerrm is distinct from 'لا يمكن تسجيل التقدم قبل التسجيل في الموسم الحالي' then
        raise;
      end if;
  end;
end;
$test$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Vérifications (SQL Editor, pas par l'app)
-- ---------------------------------------------------------------------------
--
-- A. Trigger BEFORE INSERT OR UPDATE.
--
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'public.progression'::regclass
--   and tgname = 'progression_require_active_enrollment'
--   and not tgisinternal;
-- -- attendu : 1 ligne, BEFORE INSERT OR UPDATE, fonction private.
--
-- B. search_path vide.
--
-- select prosecdef, proconfig
-- from pg_proc
-- where proname = 'progression_require_active_enrollment';
-- -- proconfig contient search_path=
--
-- C. Membre inscrit dans une saison active : l'insert n'est pas refusé
--    par CE trigger (un autre contrôle peut encore échouer).
--
-- begin;
-- insert into public.progression (membre_id, date, nb_hizb_completes, tumun_courant, date_saisie)
-- select i.membre_id, now(), 0, 0, current_date
-- from public.inscriptions i
-- join public.saisons z on z.id = i.saison_id
-- where i.statut::text = 'accepte' and z.active
-- limit 1;
-- rollback;
