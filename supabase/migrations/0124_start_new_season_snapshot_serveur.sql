-- 0124_start_new_season_snapshot_serveur.sql
-- Reprend start_new_season de 0106 (signature inchangée).
-- Le snapshot n'est plus écrit par le client avant l'appel : il est calculé
-- ici, dans la même transaction, avant tout DELETE.
-- Les gardes « snapshot manquant » et « snapshot de moins de 15 minutes »
-- sont retirées : l'horloge de l'appareil ne décide plus.
-- season_stats et season_member_stats ne font pas partie de la purge.
-- p_type : 'regular' (défaut) ou 'summer'. Le reset reste global.
-- remote = true seulement si p_type = 'summer'.
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Prérequis : 0123 (public.snapshot_season).
--
-- Reset transactionnel « انطلاق موسم جديد ».
--
-- pg_safeupdate (actif pour les appels PostgREST) refuse les DELETE sans
-- WHERE : chaque purge totale utilise donc `where true`.
-- La fonction ne fait PAS de DELETE sur auth.users.
-- Les comptes superviseurs purs passent account_status = 'inactive' ;
-- le client appelle ensuite l'Edge Function delete-user.
-- member_programs passe dans les tables purgées (étape 6).
--
-- Triggers existants sur public.profiles (non modifiés) :
--   * profiles_guard_role
--       BEFORE INSERT OR UPDATE
--       créé dans migrations_duplicates/0071_profiles_role_guard.sql
--       (absent de supabase/migrations/, mais la fonction est réécrite
--       par 0101 et 0104). Pour un appelant admin, private.is_admin()
--       laisse passer role, roles et account_status. Un non-admin
--       verrait ces trois colonnes restaurées.
--   * on_profile_link_supervisor_invitation
--       AFTER INSERT OR UPDATE OF email, role, roles (0026:275).
--       Un UPDATE de account_status seul (superviseur pur) ne le
--       déclenche pas. supervisor_invitations est déjà vidée avant.
--   * on_profile_link_member_application
--       AFTER INSERT OR UPDATE OF email, role, roles (0026:280,
--       fonction 0103). Même remarque. Si le profil est membre avant
--       et après, la fonction sort immédiatement.
--   * profiles_sync_roles EXISTE en base (BEFORE INSERT OR UPDATE,
--       public.sync_profile_roles, créé hors dépôt). Il force role ∈ roles ;
--       il est compatible avec l'étape 9 (après retrait de 'supervisor',
--       roles = {member} au minimum et role = 'member').
--   trg_test_cancelled ne réagit qu'à UPDATE OF statut vers 'annule' ;
--   le DELETE de l'étape 3 ne crée donc aucune notification.
--
-- Les triggers 0080/0081 sur saisons restent en place. À l'étape 8
-- les séances sont déjà supprimées : l'archivage et la purge ne
-- trouvent plus de lignes.
--
-- Icônes chat-group-avatars : la policy chat_group_avatars_delete_admin
-- (0055) n'autorise que private.is_chat_group_admin (superviseur de la
-- séance), pas l'admin plateforme. Après suppression des groupes le
-- contrôle échoue. Le client ne supprime donc pas ces fichiers.

-- Même signature que 0106 : CREATE OR REPLACE, pas de DROP
-- (les GRANT existants sont conservés, puis réaffirmés en bas).
create or replace function public.start_new_season(
  p_name text,
  p_start_date date,
  p_version integer,
  p_type text default 'regular'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_n integer := 0;
  v_counts jsonb := '{}'::jsonb;
  v_saison_id text;
  v_supervisor_ids uuid[] := '{}'::uuid[];
  v_chat_group_ids jsonb := '[]'::jsonb;
  v_message text;
  v_title text;
  v_snap_id text;
begin
  -- 0. Garde-fous
  if not private.is_admin() then
    raise exception 'هذه العملية للمشرف العام فقط';
  end if;

  -- Même prédicat que retire_supervisor_profile (0097) : role OU roles.
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or (p.roles is not null and 'admin' = any (p.roles))
      )
  ) then
    raise exception 'هذه العملية للمشرف العام فقط';
  end if;

  if v_name = '' or p_start_date is null or p_version is null or p_version < 1 then
    raise exception 'املأ اسم الموسم وتاريخ البداية ورقم النسخة (1 أو أكثر)';
  end if;

  if p_type is null or p_type not in ('regular', 'summer') then
    raise exception 'نوع الموسم غير صالح — اختر موسماً عادياً أو مدرسة صيفية';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('start_new_season'));

  -- Snapshot dans cette transaction, avant tout DELETE.
  -- Remplace le contrôle « toute saison à séances a déjà un snapshot »
  -- et le contrôle « snapshot actif de moins de 15 minutes » : le client
  -- n'a plus à écrire season_stats, et l'horloge de l'appareil n'est plus lue.
  -- 1) chaque saison active (regular et summer) ;
  -- 2) chaque saison close qui a encore au moins une séance et aucune ligne
  --    season_stats (rattrapage unique : une saison close déjà figée n'est
  --    pas recalculée).
  for v_snap_id in
    select z.id
    from public.saisons z
    where z.active
       or (
         not z.active
         and exists (
           select 1 from public.seances s where s.saison_id = z.id
         )
         and not exists (
           select 1 from public.season_stats ss where ss.saison_id = z.id
         )
       )
  loop
    perform public.snapshot_season(v_snap_id);
  end loop;

  -- season_stats et season_member_stats ne sont pas dans les DELETE :
  -- ce sont l'historique des saisons, pas des données de la saison en cours.
  -- La FK season_stats.saison_id → saisons est ON DELETE CASCADE, mais cette
  -- fonction ne supprime pas les lignes saisons (elle les passe active = false).

  -- 1. Demandes avant les séances (FK seance_id ON DELETE SET NULL + triggers).
  delete from public.member_applications where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('member_applications', v_n);

  -- 2.
  delete from public.supervisor_invitations where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('supervisor_invitations', v_n);

  -- 3. Invitations avant test_dates (FK date_choisie ON DELETE NO ACTION).
  delete from public.test_invitations where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('test_invitations', v_n);

  delete from public.test_dates where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('test_dates', v_n);

  delete from public.tests where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('tests', v_n);

  -- 4. Alertes (tables créées hors dépôt incluses).
  delete from public.alert_acknowledgments where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('alert_acknowledgments', v_n);

  delete from public.alert_reads where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('alert_reads', v_n);

  delete from public.alerts where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('alerts', v_n);

  delete from public.alerte_accuses where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('alerte_accuses', v_n);

  delete from public.alertes where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('alertes', v_n);

  -- 5. Groupes puis messages (FK messages sans ON DELETE vers profiles).
  select coalesce(jsonb_agg(g.id), '[]'::jsonb)
    into v_chat_group_ids
  from public.chat_groups g
  where g.avatar_url is not null
    and btrim(g.avatar_url) <> '';

  delete from public.chat_group_reads where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('chat_group_reads', v_n);

  delete from public.chat_group_messages where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('chat_group_messages', v_n);

  delete from public.chat_group_members where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('chat_group_members', v_n);

  delete from public.chat_groups where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('chat_groups', v_n);

  delete from public.messages where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('messages', v_n);

  -- 6.
  delete from public.objectifs where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('objectifs', v_n);

  delete from public.member_programs where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('member_programs', v_n);

  -- 7. Présences et inscriptions avant les séances (triggers séances).
  delete from public.presences where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('presences', v_n);

  delete from public.presence_rappels where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('presence_rappels', v_n);

  delete from public.inscriptions where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('inscriptions', v_n);

  delete from public.seances where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('seances', v_n);

  -- 8. Plus aucune séance : 0080/0081/0086 ne trouvent rien à archiver.
  update public.saisons
  set
    active = false,
    registration_open = false,
    updated_at = pg_catalog.now()
  where active;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('saisons_closed', v_n);

  -- 9. Superviseurs. Pas de DELETE auth.users.
  --    Prédicat 0097 : role / roles, admin exclu.
  select coalesce(array_agg(p.id), '{}'::uuid[])
    into v_supervisor_ids
  from public.profiles p
  where (
      p.role = 'supervisor'
      or (p.roles is not null and 'supervisor' = any (p.roles))
    )
    and not (
      p.role = 'admin'
      or (p.roles is not null and 'admin' = any (p.roles))
    )
    and not (
      p.role = 'member'
      or (p.roles is not null and 'member' = any (p.roles))
    );

  update public.profiles p
  set
    account_status = 'inactive',
    updated_at = pg_catalog.now()
  where p.id = any (v_supervisor_ids);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('profiles_deactivated', v_n);

  -- Profil mixte : on retire le rôle superviseur, le compte reste.
  update public.profiles p
  set
    roles = case
      when pg_catalog.cardinality(
        pg_catalog.array_remove(coalesce(p.roles, array[]::text[]), 'supervisor')
      ) = 0
        then array['member']::text[]
      else pg_catalog.array_remove(coalesce(p.roles, array[]::text[]), 'supervisor')
    end,
    role = case when p.role = 'supervisor' then 'member' else p.role end,
    updated_at = pg_catalog.now()
  where (
      p.role = 'supervisor'
      or (p.roles is not null and 'supervisor' = any (p.roles))
    )
    and (
      p.role = 'member'
      or (p.roles is not null and 'member' = any (p.roles))
    )
    and not (
      p.role = 'admin'
      or (p.roles is not null and 'admin' = any (p.roles))
    );
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('profiles_unlinked', v_n);

  -- 10. Après tout ce qui peut encore créer une notification.
  delete from public.notifications where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('notifications', v_n);

  -- 11. Nouvelle saison (p_type), inscription ouverte.
  -- remote vrai seulement pour l'école d'été.
  v_saison_id :=
    's_'
    || ((extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint)::text
    || '_'
    || (pg_catalog.floor(pg_catalog.random() * 10000))::integer::text;

  insert into public.saisons (
    id, name, type, start_date, end_date, version,
    registration_open, active, remote, updated_at
  ) values (
    v_saison_id, v_name, p_type, p_start_date, null, p_version,
    true, true, (p_type = 'summer'), pg_catalog.now()
  );

  -- 12. Même forme que sendAlert. Le trigger 0085 crée notifications + push.
  if p_type = 'summer' then
    v_message :=
      'انطلاق المدرسة الصيفية: «'
      || v_name
      || '» — باب التسجيل مفتوح الآن. يرجى تعبئة استمارة التسجيل من تبويب «التسجيل».';
  else
    v_message :=
      'انطلاق موسم جديد: «'
      || v_name
      || '» — باب التسجيل مفتوح الآن. يرجى تعبئة استمارة التسجيل من تبويب «التسجيل».';
  end if;

  -- title est réécrit par le trigger alerts_sync_legacy_columns (left(message, 120)).
  v_title := v_message;

  insert into public.alerts (
    id, message, title, body, audience, created_by, saison_id
  ) values (
    pg_catalog.gen_random_uuid()::text,
    v_message,
    v_title,
    v_message,
    'members',
    auth.uid(),
    v_saison_id
  );

  return jsonb_build_object(
    'saison_id', v_saison_id,
    'supervisor_ids', to_jsonb(v_supervisor_ids),
    'chat_group_ids', v_chat_group_ids,
    'counts', v_counts
  );
end;
$$;

revoke all on function public.start_new_season(text, date, integer, text) from public;
revoke all on function public.start_new_season(text, date, integer, text) from anon;
grant execute on function public.start_new_season(text, date, integer, text) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Vérifications (à lancer dans le SQL Editor, pas par l'app)
-- ---------------------------------------------------------------------------
--
-- A. AVANT la RPC, puis APRÈS la RPC et AVANT les delete-user.
--    Les deux nombres doivent être identiques : la RPC ne supprime
--    ni les profils membres, ni progression.
--    (La suppression Auth ultérieure d'un superviseur pur peut cascader
--    SES lignes à lui, pas celles des membres.)
--
-- select
--   (select count(*) from public.profiles p
--     where p.role = 'member'
--        or (p.roles is not null and 'member' = any (p.roles))
--   ) as profils_membres,
--   (select count(*) from public.progression) as progression;
--
-- B. Tables purgées : chaque compteur vaut 0, sauf alerts (1, la nouvelle)
--    et notifications (celles créées par le trigger 0085 sur cette alerte).
--
-- select
--   (select count(*) from public.member_applications) as member_applications,
--   (select count(*) from public.supervisor_invitations) as supervisor_invitations,
--   (select count(*) from public.test_invitations) as test_invitations,
--   (select count(*) from public.test_dates) as test_dates,
--   (select count(*) from public.tests) as tests,
--   (select count(*) from public.alert_acknowledgments) as alert_acknowledgments,
--   (select count(*) from public.alert_reads) as alert_reads,
--   (select count(*) from public.alerte_accuses) as alerte_accuses,
--   (select count(*) from public.alertes) as alertes,
--   (select count(*) from public.chat_group_reads) as chat_group_reads,
--   (select count(*) from public.chat_group_messages) as chat_group_messages,
--   (select count(*) from public.chat_group_members) as chat_group_members,
--   (select count(*) from public.chat_groups) as chat_groups,
--   (select count(*) from public.messages) as messages,
--   (select count(*) from public.objectifs) as objectifs,
--   (select count(*) from public.member_programs) as member_programs,
--   (select count(*) from public.presences) as presences,
--   (select count(*) from public.presence_rappels) as presence_rappels,
--   (select count(*) from public.inscriptions) as inscriptions,
--   (select count(*) from public.seances) as seances,
--   (select count(*) from public.alerts) as alerts,
--   (select count(*) from public.notifications) as notifications;
--
-- C. Aucun superviseur pur non admin. Les mixtes n'ont plus 'supervisor'.
--
-- select id, role, roles, account_status
-- from public.profiles p
-- where (
--     p.role = 'supervisor'
--     or (p.roles is not null and 'supervisor' = any (p.roles))
--   )
--   and not (
--     p.role = 'admin'
--     or (p.roles is not null and 'admin' = any (p.roles))
--   );
-- -- attendu : 0 ligne après les delete-user ;
-- -- juste après la RPC : uniquement des account_status = 'inactive'
-- -- (les mixtes ne doivent déjà plus apparaître).
--
-- D. Une seule saison active : la nouvelle, type = p_type, registration_open,
--    remote vrai seulement si type = 'summer'.
--
-- select id, name, type, active, registration_open, remote, start_date, version
-- from public.saisons
-- where active;
--
-- E. Chaque saison close qui avait des séances a une ligne season_stats.
--    (Après la RPC il n'y a plus de séances : contrôler le snapshot
--    des anciennes saisons.)
--
-- select z.id, z.name, z.active, ss.snapshot_at
-- from public.saisons z
-- left join public.season_stats ss on ss.saison_id = z.id
-- where z.active = false
-- order by z.created_at;
--
-- F. Test à blanc. Le snapshot est fait par la RPC : ne plus insérer
--    season_stats à la main avant l'appel.
--
-- begin;
-- select set_config('request.jwt.claims',
--   '{"sub":"<UUID_ADMIN>","role":"authenticated"}', true);
-- select public.start_new_season('اختبار', '2026-10-05', 1);
-- -- ou : select public.start_new_season('اختبار صيفي', '2026-10-05', 1, 'summer');
-- rollback;
--
-- G. Une seule signature dans pg_proc.
--
-- select p.oid::regprocedure
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname = 'start_new_season';
-- -- attendu : 1 ligne — start_new_season(text, date, integer, text)
--
-- H. 22 DELETE avec `where true`, 0 DELETE sans WHERE.
--    where_true et deletes doivent valoir 22.
--
-- select
--   (length(def) - length(replace(def, 'where true', '')))
--     / length('where true') as where_true,
--   (length(lower(def)) - length(replace(lower(def), 'delete from', '')))
--     / length('delete from') as deletes
-- from (
--   select pg_get_functiondef(
--     'public.start_new_season(text, date, integer, text)'::regprocedure
--   ) as def
-- ) s;
