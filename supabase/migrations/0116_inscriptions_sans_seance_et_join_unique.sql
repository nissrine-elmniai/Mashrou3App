-- 0116_inscriptions_sans_seance_et_join_unique.sql
-- A. Retrait d'une inscription acceptée par un non-admin (superviseur) :
--    les admins sont prévenus si une demande activated existe pour ce membre
--    et cette saison. auth.uid() null (delete-user / service_role, CASCADE)
--    ne notifie pas.
-- A2. Affectation directe par un admin (INSERT inscriptions, hors auto_affecter) :
--    le membre est prévenu. L'activation d'une demande passe par auto_affecter
--    (profondeur > 1) et ne double pas « تم تفعيل تجديد تسجيلك ».
-- B. Une seule demande join ouverte (pending ou invited) par email et par saison.
--
-- Exécuter d'abord la requête de doublons join (message d'accompagnement).
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Un seul script = une transaction.

-- ---------------------------------------------------------------------------
-- A. Notification admin au retrait
-- ---------------------------------------------------------------------------

create or replace function private.notify_inscription_retrait()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin_id uuid;
  v_name text;
  v_seance text;
begin
  -- Compte supprimé (service_role, auth.uid() null) ou action admin : silence.
  if auth.uid() is null or private.is_admin() then
    return old;
  end if;

  if not exists (
    select 1
    from public.member_applications a
    where a.user_id = old.membre_id
      and a.status = 'activated'
      and btrim(a.season_id) = old.saison_id
  ) then
    return old;
  end if;

  select coalesce(
           nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
           'عضو'
         )
    into v_name
  from public.profiles p
  where p.id = old.membre_id;
  v_name := coalesce(v_name, 'عضو');

  -- La séance peut déjà avoir disparu (DELETE CASCADE depuis seances).
  select coalesce(nullif(trim(s.nom), ''), 'الحصة')
    into v_seance
  from public.seances s
  where s.id = old.seance_id;
  v_seance := coalesce(v_seance, 'الحصة');

  for v_admin_id in
    select p.id
    from public.profiles p
    where (p.role = 'admin' or 'admin' = any (p.roles))
      and p.account_status = 'active'
  loop
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        v_admin_id,
        'inscriptions',
        'inscription_sans_seance',
        'عضو بدون حصة',
        format('تمت إزالة %s من حصة «%s» — يلزم تعيين حصة جديدة.', v_name, v_seance),
        jsonb_build_object(
          'screen', 'MemberProfile',
          'params', jsonb_build_object(
            'memberId', old.membre_id,
            'viewerRole', 'admin'
          ),
          'event_type', 'inscription_sans_seance'
        ),
        'inscriptions',
        old.id::text || ':retrait'
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_inscription_retrait: %', SQLERRM;
    end;
  end loop;

  return old;
end;
$function$;

drop trigger if exists notify_inscriptions_retrait on public.inscriptions;
create trigger notify_inscriptions_retrait
  after delete on public.inscriptions
  for each row
  when (old.statut = 'accepte'::inscription_statut_enum)
  execute function private.notify_inscription_retrait();

revoke all on function private.notify_inscription_retrait() from public;
grant execute on function private.notify_inscription_retrait() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- A2. Notification membre à l'affectation directe
-- ---------------------------------------------------------------------------

create or replace function private.notify_inscription_affectation_membre()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_seance text;
begin
  -- auto_affecter est déjà un trigger : profondeur > 1.
  -- Seule une insertion directe par un admin prévient le membre.
  if pg_trigger_depth() <> 1 or not private.is_admin() then
    return new;
  end if;
  if new.membre_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(s.nom), ''), 'الحصة')
    into v_seance
  from public.seances s
  where s.id = new.seance_id;
  v_seance := coalesce(v_seance, 'الحصة');

  begin
    insert into public.notifications (
      user_id, category, event_type, title, body,
      payload, source_table, source_id
    )
    values (
      new.membre_id,
      'inscriptions',
      'inscription_affectation',
      'تعيين الحصة',
      format('تم تعيينك في حصة «%s».', v_seance),
      jsonb_build_object('event_type', 'inscription_affectation'),
      'inscriptions',
      new.id::text || ':affectation'
    );
  exception
    when unique_violation then null;
    when others then
      raise notice 'notify_inscription_affectation_membre: %', SQLERRM;
  end;

  return new;
end;
$function$;

drop trigger if exists notify_inscriptions_affectation_membre on public.inscriptions;
create trigger notify_inscriptions_affectation_membre
  after insert on public.inscriptions
  for each row
  when (new.statut = 'accepte'::inscription_statut_enum)
  execute function private.notify_inscription_affectation_membre();

revoke all on function private.notify_inscription_affectation_membre() from public;
grant execute on function private.notify_inscription_affectation_membre()
  to postgres, service_role;

-- ---------------------------------------------------------------------------
-- B. Unicité des join ouverts
-- ---------------------------------------------------------------------------

do $dup$
declare
  v_n int;
begin
  select count(*) into v_n
  from (
    select 1
    from public.member_applications
    where kind = 'join'
      and status in ('pending', 'invited')
      and email is not null
      and season_id is not null
    group by lower(email), season_id
    having count(*) > 1
  ) d;
  if v_n > 0 then
    raise exception
      'Doublons join ouverts : % couple(s) (email, saison). Nettoyer avant l''index.',
      v_n;
  end if;
end
$dup$;

create unique index if not exists member_applications_join_open_email_season_uidx
  on public.member_applications (lower(email), season_id)
  where kind = 'join'
    and status in ('pending', 'invited')
    and email is not null
    and season_id is not null;
