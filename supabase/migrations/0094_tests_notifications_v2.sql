-- 0094_tests_notifications_v2.sql
-- Textes des notifications de tests, plus les événements admin :
-- changement de date, refus enregistré par l'admin, annulation du test.
-- Le push reste délégué à trg_notifications_after_insert (0068).
-- createTest insère test_dates avant test_invitations : l'annonce
-- AFTER INSERT peut donc lire max(date_proposee).

begin;

-- « 3 أكتوبر 2026 », mois ar-MA, chiffres latins. Aligné sur formatTestDate.
create or replace function private.format_date_ar(d date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_months text[] := array[
    'يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو',
    'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'
  ];
begin
  if d is null then
    return null;
  end if;
  return format(
    '%s %s %s',
    extract(day from d)::int,
    v_months[extract(month from d)::int],
    extract(year from d)::int
  );
end;
$$;

revoke all on function private.format_date_ar(date) from public;
grant execute on function private.format_date_ar(date) to postgres, service_role;

-- Annonce au membre invité. Un échec d'insert notification ne doit pas
-- annuler la création de l'invitation.
create or replace function private.notify_test_invitation_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titre text;
  v_limite text;
  v_body text;
begin
  if new.membre_id is null or new.statut is distinct from 'invite' then
    return new;
  end if;

  select coalesce(nullif(trim(both from t.titre), ''), 'اختبار')
    into v_titre
  from public.tests t
  where t.id = new.test_id;

  v_titre := coalesce(v_titre, 'اختبار');

  select private.format_date_ar(max(td.date_proposee))
      into v_limite
  from public.test_dates td
  where td.test_id = new.test_id;

  if v_limite is null or btrim(v_limite) = '' then
    v_body := format('لقد تمت دعوتك لاجتياز اختبار «%s».', v_titre);
  else
    v_body := format(
      'لقد تمت دعوتك لاجتياز اختبار «%s». اختر موعدك قبل %s.',
      v_titre,
      v_limite
    );
  end if;

  begin
    insert into public.notifications (
      user_id, category, event_type, title, body,
      payload, source_table, source_id
    )
    values (
      new.membre_id,
      'tests',
      'test_invite',
      'اختبار جديد',
      v_body,
      jsonb_build_object(
        'test_id', new.test_id,
        'invitation_id', new.id,
        'event_type', 'test_invite'
      ),
      'test_invitations',
      new.id::text
    );
  exception
    when others then
      raise notice 'notify_test_invitation_created: %', SQLERRM;
  end;

  return new;
end;
$$;

drop trigger if exists trg_test_invitation_announce on public.test_invitations;
create trigger trg_test_invitation_announce
  after insert on public.test_invitations
  for each row
  execute function private.notify_test_invitation_created();

revoke all on function private.notify_test_invitation_created() from public;
grant execute on function private.notify_test_invitation_created() to postgres, service_role;

-- Résultat : seulement le premier remplissage de date_notification_resultat.
create or replace function private.notify_test_result_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titre text;
  v_note text;
begin
  if new.membre_id is null or new.statut is distinct from 'note' or new.note is null then
    return new;
  end if;

  select coalesce(nullif(trim(both from t.titre), ''), 'اختبار')
    into v_titre
  from public.tests t
  where t.id = new.test_id;

  v_titre := coalesce(v_titre, 'اختبار');
  v_note := trim_scale(new.note)::text;

  begin
    insert into public.notifications (
      user_id, category, event_type, title, body,
      payload, source_table, source_id
    )
    values (
      new.membre_id,
      'tests',
      'test_result',
      'نتيجة الاختبار',
      format('نتيجتك في اختبار «%s»: %s/20.', v_titre, v_note),
      jsonb_build_object(
        'test_id', new.test_id,
        'invitation_id', new.id,
        'event_type', 'test_result'
      ),
      'test_invitations',
      new.id::text
    );
  exception
    when others then
      raise notice 'notify_test_result_sent: %', SQLERRM;
  end;

  return new;
end;
$$;

drop trigger if exists trg_test_result_notified on public.test_invitations;
create trigger trg_test_result_notified
  after update of date_notification_resultat on public.test_invitations
  for each row
  when (
    old.date_notification_resultat is null
    and new.date_notification_resultat is not null
  )
  execute function private.notify_test_result_sent();

revoke all on function private.notify_test_result_sent() from public;
grant execute on function private.notify_test_result_sent() to postgres, service_role;

-- Changement de date ou refus posé par l'admin. Le membre qui répond
-- lui-même ne déclenche rien : private.user_has_role('admin') lit auth.uid().
-- source_id horodaté : l'index (user_id, event_type, source_id) doit
-- laisser passer un second changement de date.
create or replace function private.notify_test_invitation_admin_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titre text;
  v_date text;
  v_heure time;
  v_heure_txt text;
  v_body text;
  v_event text;
  v_title text;
begin
  if not private.user_has_role('admin') or old.statut = 'note' then
    return new;
  end if;

  if new.membre_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(both from t.titre), ''), 'اختبار')
    into v_titre
  from public.tests t
  where t.id = new.test_id;

  v_titre := coalesce(v_titre, 'اختبار');

  if new.statut = 'confirme'
     and new.date_choisie is distinct from old.date_choisie
     and new.date_choisie is not null then
    v_event := 'test_date_changed';
    v_title := 'تغيير موعد الاختبار';
    v_date := private.format_date_ar(new.date_choisie);

    select td.heure_proposee
      into v_heure
    from public.test_dates td
    where td.test_id = new.test_id
      and td.date_proposee = new.date_choisie;

    v_heure_txt := case
      when v_heure is null then null
      else to_char(v_heure, 'HH24:MI')
    end;

    if v_heure_txt is null or btrim(v_heure_txt) = '' then
      v_body := format('تم تغيير موعد اختبار «%s» إلى %s.', v_titre, v_date);
    else
      v_body := format(
        'تم تغيير موعد اختبار «%s» إلى %s على الساعة %s.',
        v_titre,
        v_date,
        v_heure_txt
      );
    end if;
  elsif old.statut is distinct from 'refuse' and new.statut = 'refuse' then
    v_event := 'test_refused_by_admin';
    v_title := 'تحديث الاختبار';
    v_body := format('تم تسجيل اعتذارك عن اختبار «%s».', v_titre);
  else
    return new;
  end if;

  begin
    insert into public.notifications (
      user_id, category, event_type, title, body,
      payload, source_table, source_id
    )
    values (
      new.membre_id,
      'tests',
      v_event,
      v_title,
      v_body,
      jsonb_build_object(
        'test_id', new.test_id,
        'invitation_id', new.id,
        'event_type', v_event
      ),
      'test_invitations',
      new.id::text || ':' || extract(epoch from now())::bigint::text
    );
  exception
    when others then
      raise notice 'notify_test_invitation_admin_update: %', SQLERRM;
  end;

  return new;
end;
$$;

drop trigger if exists trg_test_invitation_admin_update on public.test_invitations;
create trigger trg_test_invitation_admin_update
  after update of statut, date_choisie on public.test_invitations
  for each row
  when (old.statut is distinct from 'note')
  execute function private.notify_test_invitation_admin_update();

revoke all on function private.notify_test_invitation_admin_update() from public;
grant execute on function private.notify_test_invitation_admin_update() to postgres, service_role;

-- Annulation du test : une notification par invitation encore ouverte.
-- source_id = id d'invitation, un seul envoi possible.
create or replace function private.notify_test_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titre text;
  v_inv record;
begin
  if old.statut = 'annule' or new.statut is distinct from 'annule' then
    return new;
  end if;

  select coalesce(nullif(trim(both from new.titre), ''), 'اختبار')
    into v_titre;

  v_titre := coalesce(v_titre, 'اختبار');

  for v_inv in
    select i.id, i.membre_id
    from public.test_invitations i
    where i.test_id = new.id
      and i.statut in ('invite', 'confirme')
      and i.membre_id is not null
  loop
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        v_inv.membre_id,
        'tests',
        'test_cancelled',
        'إلغاء الاختبار',
        format('تم إلغاء اختبار «%s».', v_titre),
        jsonb_build_object(
          'test_id', new.id,
          'invitation_id', v_inv.id,
          'event_type', 'test_cancelled'
        ),
        'tests',
        v_inv.id::text
      );
    exception
      when others then
        raise notice 'notify_test_cancelled: %', SQLERRM;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_test_cancelled on public.tests;
create trigger trg_test_cancelled
  after update of statut on public.tests
  for each row
  when (
    old.statut is distinct from 'annule'
    and new.statut = 'annule'
  )
  execute function private.notify_test_cancelled();

revoke all on function private.notify_test_cancelled() from public;
grant execute on function private.notify_test_cancelled() to postgres, service_role;

notify pgrst, 'reload schema';

commit;

-- Vérification (à lancer à part) :
--
-- select tgname, tgrelid::regclass as table_name, pg_get_triggerdef(oid)
-- from pg_trigger
-- where not tgisinternal
--   and tgname in (
--     'trg_test_invitation_announce',
--     'trg_test_result_notified',
--     'trg_test_invitation_admin_update',
--     'trg_test_cancelled'
--   )
-- order by tgname;
--
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'private'
--   and p.proname in (
--     'format_date_ar',
--     'notify_test_invitation_created',
--     'notify_test_result_sent',
--     'notify_test_invitation_admin_update',
--     'notify_test_cancelled'
--   )
-- order by p.proname;
