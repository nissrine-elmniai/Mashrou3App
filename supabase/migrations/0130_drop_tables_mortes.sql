-- 0130 : suppression des tables mortes. NE PAS exécuter automatiquement.
--
-- start_new_season : corps de 0124 (lignes 56-356), sans les DELETE ni les
-- clés counts de alert_reads, alerte_accuses et alertes.
-- alerts et alert_acknowledgments restent purgées.
-- Signature, search_path = '', security definer et grants inchangés.
-- notify_alerte_nouvelle et la catégorie notifications 'alertes' ne sont pas touchées.
-- activation_codes n'est pas supprimée.
--
-- Les policies des 12 tables sont retirées avant les DROP : certaines se lisent
-- entre elles (ex. exams_read_related → exam_participants).
-- Vérifié avant : aucune policy d'une table vivante ne lit ces tables.
--
-- DROP TABLE sans CASCADE. IF EXISTS : plusieurs de ces noms n'ont jamais été
-- créés dans supabase/migrations/ ; un nom déjà absent ne doit pas annuler
-- la transaction du SQL Editor.
--
-- Après cette migration, la fonction contient 19 DELETE ... where true
-- (et non plus 22 : vérification H de 0124 à adapter).

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

  -- 4. Alertes (stack legacy alerts ; alertes, alerte_accuses et alert_reads supprimées par 0130).
  delete from public.alert_acknowledgments where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('alert_acknowledgments', v_n);

  delete from public.alerts where true;
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('alerts', v_n);

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

-- Policies des tables mortes : retirées avant les DROP.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('attendance_records','attendance_sessions','exam_participants','exams',
                        'group_members','member_progress','groups','seasons',
                        'alerte_accuses','alertes','alert_reads','invitations')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

-- Ordre des clés étrangères : enfants avant parents.
drop table if exists public.attendance_records;
drop table if exists public.attendance_sessions;
drop table if exists public.exam_participants;
drop table if exists public.exams;
drop table if exists public.group_members;
drop table if exists public.member_progress;
drop table if exists public.groups;
drop table if exists public.seasons;
drop table if exists public.alerte_accuses;
drop table if exists public.alertes;
drop table if exists public.alert_reads;
drop table if exists public.invitations;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Vérifications (SQL Editor, après exécution). Ne pas lancer avec le DDL.
-- ---------------------------------------------------------------------------
--
-- 1. Tables absentes : 0 ligne.
-- select table_name
-- from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('attendance_records','attendance_sessions','exam_participants','exams',
--                      'group_members','member_progress','groups','seasons',
--                      'alerte_accuses','alertes','alert_reads','invitations');
--
-- 2. La fonction ne mentionne plus ces tables : quatre 0.
--    supervisor_invitations et test_invitations restent, ce n'est pas invitations.
-- select
--   position('alert_reads' in def)        as alert_reads,
--   position('alerte_accuses' in def)     as alerte_accuses,
--   position('public.alertes' in def)     as alertes,
--   position('public.invitations' in def) as invitations
-- from (
--   select pg_get_functiondef('public.start_new_season(text,date,integer,text)'::regprocedure) as def
-- ) s;
--
-- 3. 19 DELETE, tous avec where true.
-- select
--   (length(def) - length(replace(def, 'where true', ''))) / length('where true') as where_true,
--   (length(lower(def)) - length(replace(lower(def), 'delete from', ''))) / length('delete from') as deletes
-- from (
--   select pg_get_functiondef('public.start_new_season(text,date,integer,text)'::regprocedure) as def
-- ) s;
