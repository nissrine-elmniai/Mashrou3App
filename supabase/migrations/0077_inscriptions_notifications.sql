-- 0077_inscriptions_notifications.sql
-- Lot 2 — Notifications catégorie « inscriptions ».
-- Modèle d'INSERT / d'erreur : 0070_presence_rappel_notifications.sql,
-- 0071_presence_absence_notifications.sql.
-- L'échec d'une notification ne doit JAMAIS faire échouer la transaction métier.
--
-- Prérequis : 0076_drop_legacy_cdc_tables.sql doit être collée AVANT ce fichier
-- (elle rétablit inscriptions_membre_id_fkey / presences_membre_id_fkey vers profiles).
--
-- Dette connue du lot 2 : la notification « nouveau membre » ne se déclenche que
-- sur INSERT dans inscriptions. Le déplacement d'un membre déjà inscrit
-- (UPDATE de seance_id via updateMemberSeance) ne prévient pas le nouveau
-- superviseur — renvoyé au lot 3 « Séances ».

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1) Nouvelle demande → admin(s) actifs
-- ---------------------------------------------------------------------------

create or replace function private.notify_inscription_demande()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_admin_id uuid;
  v_name text;
  v_title text;
  v_body text;
begin
  -- Nom candidat : full_name, sinon first + last.
  v_name := coalesce(
    nullif(trim(new.full_name), ''),
    nullif(
      trim(both from concat_ws(' ', new.first_name, new.last_name)),
      ''
    ),
    'مترشح'
  );

  if coalesce(new.kind, 'join') = 'season_renewal' then
    v_title := 'طلب تجديد الموسم';
    v_body := format('%s طلب تجديد التسجيل للموسم.', v_name);
  else
    v_title := 'طلب انضمام جديد';
    v_body := format('%s قدّم طلب انضمام.', v_name);
  end if;

  for v_admin_id in
    select p.id
    from public.profiles p
    where (p.role = 'admin' or 'admin' = any (p.roles))
      and p.account_status = 'active'
  loop
    begin
      insert into public.notifications (
        user_id,
        category,
        event_type,
        title,
        body,
        payload,
        source_table,
        source_id
      )
      values (
        v_admin_id,
        'inscriptions',
        'inscription_demande',
        v_title,
        v_body,
        jsonb_build_object(
          'screen', 'AdminRegistrations',
          'application_id', new.id,
          'kind', new.kind,
          'params', jsonb_build_object(
            'application_id', new.id,
            'kind', new.kind
          ),
          'event_type', 'inscription_demande'
        ),
        'member_applications',
        new.id
      );
    exception
      when unique_violation then
        null;
      when others then
        raise notice 'notify_inscription_demande: %', SQLERRM;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_member_applications_demande on public.member_applications;
create trigger notify_member_applications_demande
  after insert on public.member_applications
  for each row
  when (new.status = 'pending')
  execute function private.notify_inscription_demande();

revoke all on function private.notify_inscription_demande() from public;
grant execute on function private.notify_inscription_demande() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 2 + 3) Décision admin → membre (refus / renouvellement activé)
-- Un seul trigger UPDATE OF status. Ordre alpha : notify_* après
-- member_applications_auto_affectation / member_applications_sync_profile.
-- ---------------------------------------------------------------------------

create or replace function private.notify_inscription_decision()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_has_profile boolean;
begin
  -- a) Refus : uniquement si un compte (user_id) existe et un profil associé.
  if new.status = 'rejected' then
    if new.user_id is null then
      return new;
    end if;

    select exists (
      select 1 from public.profiles p where p.id = new.user_id
    ) into v_has_profile;

    if not v_has_profile then
      return new;
    end if;

    begin
      insert into public.notifications (
        user_id,
        category,
        event_type,
        title,
        body,
        payload,
        source_table,
        source_id
      )
      values (
        new.user_id,
        'inscriptions',
        'inscription_refus',
        'نتيجة طلب التسجيل',
        'نأسف، لم يتم قبول طلب التسجيل.',
        jsonb_build_object(
          'event_type', 'inscription_refus'
        ),
        'member_applications',
        new.id
      );
    exception
      when unique_violation then
        null;
      when others then
        raise notice 'notify_inscription_decision (refus): %', SQLERRM;
    end;

    return new;
  end if;

  -- b) Activation d'un renouvellement de saison uniquement.
  if new.status = 'activated' and coalesce(new.kind, '') = 'season_renewal' then
    if new.user_id is null then
      return new;
    end if;

    select exists (
      select 1 from public.profiles p where p.id = new.user_id
    ) into v_has_profile;

    if not v_has_profile then
      return new;
    end if;

    begin
      insert into public.notifications (
        user_id,
        category,
        event_type,
        title,
        body,
        payload,
        source_table,
        source_id
      )
      values (
        new.user_id,
        'inscriptions',
        'inscription_renouvellement',
        'تم تأكيد التجديد',
        'تم تفعيل تجديد تسجيلك بنجاح.',
        jsonb_build_object(
          'event_type', 'inscription_renouvellement'
        ),
        'member_applications',
        new.id
      );
    exception
      when unique_violation then
        null;
      when others then
        raise notice 'notify_inscription_decision (renouvellement): %', SQLERRM;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_member_applications_decision on public.member_applications;
create trigger notify_member_applications_decision
  after update of status on public.member_applications
  for each row
  when (
    new.status is distinct from old.status
    and new.status in ('rejected', 'activated')
  )
  execute function private.notify_inscription_decision();

revoke all on function private.notify_inscription_decision() from public;
grant execute on function private.notify_inscription_decision() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 4) Nouveau membre dans la séance → superviseur
-- Nom notify_* : après inscriptions_sync_chat_group (ordre alphabétique AFTER).
-- CORRECTIF : filtre statut = 'accepte' dans le WHEN — le défaut de l'enum est
-- 'en_attente', une inscription non validée ne doit pas notifier le superviseur.
-- ---------------------------------------------------------------------------

create or replace function private.notify_inscription_nouveau_membre()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_superviseur uuid;
  v_seance_nom text;
  v_member_name text;
begin
  select s.superviseur_id, s.nom
  into v_superviseur, v_seance_nom
  from public.seances s
  where s.id = new.seance_id;

  if v_superviseur is null then
    return new;
  end if;

  -- Le superviseur qui vient d'affecter / déplacer le membre ne se notifie pas.
  -- auth.uid() est null quand l'INSERT vient d'auto_affecter (contexte serveur),
  -- la garde laisse donc passer les affectations automatiques.
  if auth.uid() is not distinct from v_superviseur then
    return new;
  end if;

  select coalesce(
    nullif(
      trim(both from concat_ws(' ', p.first_name, p.last_name)),
      ''
    ),
    'عضو'
  )
  into v_member_name
  from public.profiles p
  where p.id = new.membre_id;

  v_member_name := coalesce(v_member_name, 'عضو');
  v_seance_nom := coalesce(nullif(trim(v_seance_nom), ''), 'الحصة');

  begin
    insert into public.notifications (
      user_id,
      category,
      event_type,
      title,
      body,
      payload,
      source_table,
      source_id
    )
    values (
      v_superviseur,
      'inscriptions',
      'inscription_nouveau_membre',
      'عضو جديد في الحصة',
      format('انضم %s إلى حصة «%s».', v_member_name, v_seance_nom),
      jsonb_build_object(
        'screen', 'MemberProfile',
        'memberId', new.membre_id,
        'seanceId', new.seance_id,
        'saisonId', new.saison_id,
        'params', jsonb_build_object(
          'memberId', new.membre_id,
          'seanceId', new.seance_id,
          'saisonId', new.saison_id
        ),
        'event_type', 'inscription_nouveau_membre'
      ),
      'inscriptions',
      new.id::text
    );
  exception
    when unique_violation then
      null;
    when others then
      raise notice 'notify_inscription_nouveau_membre: %', SQLERRM;
  end;

  return new;
end;
$$;

drop trigger if exists notify_inscriptions_nouveau_membre on public.inscriptions;
create trigger notify_inscriptions_nouveau_membre
  after insert on public.inscriptions
  for each row
  when (new.statut = 'accepte'::inscription_statut_enum)
  execute function private.notify_inscription_nouveau_membre();

revoke all on function private.notify_inscription_nouveau_membre() from public;
grant execute on function private.notify_inscription_nouveau_membre() to postgres, service_role;

-- ===========================================================================
-- 5) OPTIONNEL — activation sans ligne inscriptions (auto_affectation a échoué
--    silencieusement via RAISE NOTICE). notify_* s'exécute APRÈS
--    member_applications_auto_affectation (m < n).
--    CORRECTIF : le test d'existence porte sur seance_id OU saison_id btrimé.
--    inscriptions.saison_id est dérivé de seances.saison_id par le trigger
--    BEFORE inscriptions_sync_saison, pas de member_applications.season_id ;
--    et un season_id null rendait la comparaison NULL (fausse alerte).
-- ===========================================================================

create or replace function private.notify_inscription_sans_affectation()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_admin_id uuid;
  v_name text;
begin
  if new.user_id is null then
    return new;
  end if;

  -- auto_affectation a déjà tourné : s'il n'y a toujours pas d'inscription
  -- pour ce membre (séance demandée ou saison), prévenir les admins.
  if exists (
    select 1
    from public.inscriptions i
    where i.membre_id = new.user_id
      and (
        i.seance_id = new.seance_id
        or i.saison_id = btrim(coalesce(new.season_id, ''))
      )
  ) then
    return new;
  end if;

  v_name := coalesce(
    nullif(trim(new.full_name), ''),
    nullif(
      trim(both from concat_ws(' ', new.first_name, new.last_name)),
      ''
    ),
    'مترشح'
  );

  for v_admin_id in
    select p.id
    from public.profiles p
    where (p.role = 'admin' or 'admin' = any (p.roles))
      and p.account_status = 'active'
  loop
    begin
      insert into public.notifications (
        user_id,
        category,
        event_type,
        title,
        body,
        payload,
        source_table,
        source_id
      )
      values (
        v_admin_id,
        'inscriptions',
        'inscription_sans_affectation',
        'تفعيل بدون حصة',
        format(
          'تم تفعيل %s دون تعيين حصة — يلزم التدخل اليدوي.',
          v_name
        ),
        jsonb_build_object(
          'screen', 'AdminRegistrations',
          'application_id', new.id,
          'kind', new.kind,
          'params', jsonb_build_object(
            'application_id', new.id,
            'kind', new.kind
          ),
          'event_type', 'inscription_sans_affectation'
        ),
        'member_applications',
        new.id
      );
    exception
      when unique_violation then
        null;
      when others then
        raise notice 'notify_inscription_sans_affectation: %', SQLERRM;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_member_applications_sans_affectation
  on public.member_applications;
create trigger notify_member_applications_sans_affectation
  after update of status on public.member_applications
  for each row
  when (
    new.status is distinct from old.status
    and new.status = 'activated'
  )
  execute function private.notify_inscription_sans_affectation();

revoke all on function private.notify_inscription_sans_affectation() from public;
grant execute on function private.notify_inscription_sans_affectation()
  to postgres, service_role;

-- ===========================================================================
-- Vérifications post-collage (à exécuter manuellement dans le SQL Editor)
-- ===========================================================================
--
-- -- Les 4 triggers sont-ils posés, avec les bonnes clauses WHEN ?
-- select tgname, pg_get_triggerdef(oid, true)
-- from pg_trigger
-- where not tgisinternal
--   and tgrelid in (
--     'public.member_applications'::regclass,
--     'public.inscriptions'::regclass
--   )
--   and tgname like 'notify_%'
-- order by tgrelid::regclass::text, tgname;
--
-- -- Ordre d'exécution réel sur member_applications (alphabétique) :
-- -- member_applications_auto_affectation → member_applications_sync_profile
-- -- → notify_member_applications_decision → notify_member_applications_sans_affectation
-- select tgname from pg_trigger
-- where tgrelid = 'public.member_applications'::regclass and not tgisinternal
-- order by tgname;
--
-- -- Émissions par catégorie (la catégorie « inscriptions » était à 0 avant ce lot)
-- select category, event_type, count(*)
-- from public.notifications
-- group by 1, 2
-- order by 1, 2;
--
-- ---------------------------------------------------------------------------
-- Plan de test manuel
-- ---------------------------------------------------------------------------
-- 1) Demande pending (join) via écran d'inscription public
--    → chaque admin actif reçoit inscription_demande (انضمام).
-- 2) Demande pending (season_renewal)
--    → chaque admin actif reçoit inscription_demande (تجديد).
-- 3) Admin refuse une demande liée à un user_id (compte existant)
--    → le membre reçoit inscription_refus (NotificationDetail au tap).
-- 4) Admin refuse une demande sans user_id
--    → aucune notif membre, pas d'erreur métier.
-- 5) Admin active un season_renewal
--    → le membre reçoit inscription_renouvellement ;
--      si auto_affectation crée une inscription → superviseur reçoit
--      inscription_nouveau_membre (sauf s'il est l'auteur de l'INSERT) ;
--      si aucune inscription → admins reçoivent inscription_sans_affectation.
-- 6) Admin / système affecte manuellement un membre (INSERT inscriptions
--    statut 'accepte') alors que auth.uid() ≠ superviseur_id
--    → superviseur reçoit inscription_nouveau_membre.
-- 7) Superviseur inscrit lui-même un membre
--    → pas de notif au même superviseur (garde auth.uid()).
-- 8) INSERT inscriptions avec statut 'en_attente'
--    → aucune notif (clause WHEN du trigger).
-- ===========================================================================