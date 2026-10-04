-- 0109_objectifs_require_enrollment.sql
-- Interdit de créer ou modifier un objectif tant que le membre n'a pas
-- d'inscription acceptée dans CETTE saison, et que cette saison est active.
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
--
-- Colonnes (0057, 0058, 0062) : membre_id, saison_id, nb_hizb_cible,
-- created_at, updated_at, nb_hizb_depart.
-- Clé primaire : (membre_id, saison_id).

create or replace function private.objectifs_require_active_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- statut ::text : compatible avec inscription_statut_enum et avec text.
  -- La saison de la ligne doit être exactement new.saison_id, et active.
  if not exists (
    select 1
    from public.inscriptions i
    join public.saisons z on z.id = i.saison_id
    where i.membre_id = new.membre_id
      and i.saison_id = new.saison_id
      and i.statut::text = 'accepte'
      and z.active
  ) then
    raise exception 'لا يمكن تحديد الهدف قبل التسجيل في الموسم الحالي';
  end if;
  return new;
end;
$$;

revoke all on function private.objectifs_require_active_enrollment() from public;
revoke all on function private.objectifs_require_active_enrollment() from anon;
revoke all on function private.objectifs_require_active_enrollment() from authenticated;
grant execute on function private.objectifs_require_active_enrollment() to postgres, service_role;

drop trigger if exists objectifs_require_active_enrollment on public.objectifs;
create trigger objectifs_require_active_enrollment
  before insert or update on public.objectifs
  for each row
  execute function private.objectifs_require_active_enrollment();

-- Test : un membre sans inscription ne peut pas insérer.
-- Le bloc intérieur annule l'insert (exception). Si le message n'est pas
-- celui attendu, l'exception remonte et la migration entière est annulée.
do $test$
begin
  begin
    insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
    values (
      '00000000-0000-0000-0000-000000000000',
      'saison-test-sans-inscription',
      1
    );
    raise exception 'TEST: insert accepté pour un membre non inscrit';
  exception
    when others then
      if sqlerrm is distinct from 'لا يمكن تحديد الهدف قبل التسجيل في الموسم الحالي' then
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
-- where tgrelid = 'public.objectifs'::regclass
--   and tgname = 'objectifs_require_active_enrollment'
--   and not tgisinternal;
-- -- attendu : 1 ligne, BEFORE INSERT OR UPDATE, fonction private.
--
-- B. search_path vide.
--
-- select prosecdef, proconfig
-- from pg_proc
-- where proname = 'objectifs_require_active_enrollment';
-- -- proconfig contient search_path=
--
-- C. Membre inscrit dans cette saison active : l'insert n'est pas refusé
--    par CE trigger (un autre contrôle peut encore échouer).
--
-- begin;
-- insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
-- select i.membre_id, i.saison_id, 1
-- from public.inscriptions i
-- join public.saisons z on z.id = i.saison_id
-- where i.statut::text = 'accepte' and z.active
-- limit 1
-- on conflict (membre_id, saison_id) do update
--   set nb_hizb_cible = excluded.nb_hizb_cible;
-- rollback;
