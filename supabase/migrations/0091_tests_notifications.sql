-- 0091_tests_notifications.sql
-- Annonce d'un test et envoi du résultat, via la table notifications.
-- Le push n'est pas appelé ici : trg_notifications_after_insert (0068)
-- envoie déjà la ligne à send-push.
--
-- CHECK live notifications_category_check : les 7 catégories historiques.
-- On y ajoute 'tests'. Les colonnes push_*, claimed_at et
-- dispatch_request_id ne sont pas modifiées.

begin;

alter table public.notifications
  drop constraint if exists notifications_category_check;

alter table public.notifications
  add constraint notifications_category_check
  check (category in (
    'chat',
    'presence',
    'inscriptions',
    'seances',
    'progression',
    'alertes',
    'systeme',
    'tests'
  ));

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
begin
  if new.membre_id is null or new.statut is distinct from 'invite' then
    return new;
  end if;

  select coalesce(nullif(trim(both from t.titre), ''), 'اختبار')
    into v_titre
  from public.tests t
  where t.id = new.test_id;

  v_titre := coalesce(v_titre, 'اختبار');

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
      format('دُعيت إلى اختبار «%s».', v_titre),
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
-- L'admin pose cette date via markResultsNotified, après la note.
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
      format('نتيجتك في «%s»: %s/20.', v_titre, v_note),
      jsonb_build_object(
        'test_id', new.test_id,
        'invitation_id', new.id,
        'note', new.note,
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

notify pgrst, 'reload schema';

commit;

-- Vérification (à lancer à part) :
--
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.notifications'::regclass
--   and conname = 'notifications_category_check';
--
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'public.test_invitations'::regclass
--   and not tgisinternal
-- order by tgname;
