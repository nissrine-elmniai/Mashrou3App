-- 0137_objectifs_require_position.sql
-- Un objectif de saison ne peut être créé que si le départ de la saison est
-- connu : au moins une position (ligne progression) avant le début de la
-- saison ou dans la saison (private.season_start_tumun, 0135).
-- Sinon : « احفظ موضعك أولاً قبل تحديد هدف الموسم ».
--
-- INSERT seulement : une ligne existante peut toujours être modifiée
-- (nb_hizb_cible), et les objectifs créés avant cette migration sans
-- position restent en place (avancement NULL côté RPC).
--
-- security definer : private.season_start_tumun est révoquée pour
-- authenticated ; le trigger s'exécute avec les droits de l'appelant sinon.
--
-- Ordre des triggers sur public.objectifs (même moment : ordre alphabétique) :
--   BEFORE INSERT OR UPDATE  objectifs_require_active_enrollment (0109)
--   BEFORE INSERT            objectifs_require_position          (0137)
--   AFTER  INSERT            notify_objectifs_insert              (0087)
--   AFTER  UPDATE OF nb_hizb_cible  notify_objectifs_update       (0087)
-- Le message d'inscription passe donc avant celui de position.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Prérequis : 0135 (private.season_start_tumun).

create or replace function private.objectifs_require_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.season_start_tumun(new.membre_id, new.saison_id) is null then
    raise exception 'احفظ موضعك أولاً قبل تحديد هدف الموسم';
  end if;
  return new;
end;
$$;

revoke all on function private.objectifs_require_position() from public;
revoke all on function private.objectifs_require_position() from anon;
revoke all on function private.objectifs_require_position() from authenticated;

drop trigger if exists objectifs_require_position on public.objectifs;
create trigger objectifs_require_position
  before insert on public.objectifs
  for each row
  execute function private.objectifs_require_position();

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Vérifications (SQL Editor, pas par l'app)
-- ---------------------------------------------------------------------------
--
-- A. Triggers de public.objectifs, dans l'ordre d'exécution.
--
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'public.objectifs'::regclass
--   and not tgisinternal
-- order by tgname;
-- -- attendu : objectifs_require_active_enrollment puis objectifs_require_position
-- --           (BEFORE), notify_objectifs_insert / notify_objectifs_update (AFTER).
--
-- B. security definer et search_path vide.
--
-- select prosecdef, proconfig
-- from pg_proc
-- where proname = 'objectifs_require_position';
-- -- attendu : prosecdef = true, proconfig contient search_path=
--
-- C. Objectifs existants sans position (créés avant 0137).
--
-- select o.membre_id, o.saison_id, o.nb_hizb_cible
-- from public.objectifs o
-- join public.saisons z on z.id = o.saison_id and z.active
-- where private.season_start_tumun(o.membre_id, o.saison_id) is null;
--
-- D. Test à blanc. Toutes les écritures sont annulées : le bloc se termine
--    TOUJOURS par une exception qui contient les résultats. Prérequis : une
--    saison active, un membre « accepte » dedans, un admin.
--
-- do $test$
-- declare
--   v_admin uuid;
--   v_membre uuid;
--   v_saison text;
--   v_out text := '';
-- begin
--   select z.id into v_saison from public.saisons z where z.active limit 1;
--   if v_saison is null then raise exception 'TEST: aucune saison active'; end if;
--
--   select i.membre_id into v_membre
--   from public.inscriptions i
--   where i.saison_id = v_saison and i.statut::text = 'accepte'
--   limit 1;
--   if v_membre is null then raise exception 'TEST: aucun membre accepte'; end if;
--
--   select p.id into v_admin
--   from public.profiles p
--   where private.profile_has_role(p.id, 'admin')
--   limit 1;
--   if v_admin is null then raise exception 'TEST: aucun admin'; end if;
--
--   perform set_config('request.jwt.claims',
--     jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
--
--   delete from public.progression where membre_id = v_membre;
--   delete from public.objectifs where membre_id = v_membre and saison_id = v_saison;
--
--   -- 1. Objectif sans position : refusé.
--   begin
--     insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
--     values (v_membre, v_saison, 5);
--     v_out := v_out || E'\n1 objectif sans position : ACCEPTE (anomalie)';
--   exception when others then
--     v_out := v_out || E'\n1 objectif sans position : refuse (' || sqlerrm || ')';
--   end;
--
--   -- 2. Position puis objectif : accepté.
--   insert into public.progression (membre_id, saison_id, date, nb_hizb_completes, tumun_courant)
--   values (v_membre, v_saison, now(), 5, 0);
--   begin
--     insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
--     values (v_membre, v_saison, 5);
--     v_out := v_out || E'\n2 position puis objectif : accepte, '
--       || public.get_member_season_progress(v_membre)::text;
--   exception when others then
--     v_out := v_out || E'\n2 position puis objectif : REFUSE (' || sqlerrm || ')';
--   end;
--
--   raise exception 'TEST 0137 (annulé) :%', v_out;
-- end;
-- $test$;
