-- 0075_notification_copy.sql
-- Reformulation des titres/corps (choix produit, lot 1.5 B).
-- Logique inchangée : mêmes INSERT, payloads, source_id.
-- 0068 / 0071 / 0072 déjà collés : ne pas les recoller.

create or replace function private.notify_presence_rappel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_superviseur uuid;
  v_nom text;
  v_jour text;
  v_heure time;
  v_occ date;
  v_win boolean;
  v_date_label text;
  v_source text;
  v_window_end timestamptz;
  v_n integer;
  v_title text;
  v_body text;
begin
  select s.superviseur_id, s.nom
  into v_superviseur, v_nom
  from public.seances s
  where s.id = new.seance_id
    and s.statut = 'active';

  if v_superviseur is null then
    raise notice 'notify_presence_rappel: seance % inactive ou sans superviseur', new.seance_id;
    return new;
  end if;

  select p.jour, p.heure_debut
  into v_jour, v_heure
  from public.get_seance_planning_at(new.seance_id, now()) p;

  select o.occurrence_date, o.within_marking_window, o.window_end
  into v_occ, v_win, v_window_end
  from public.compute_current_seance_occurrence(v_jour, v_heure, now()) o;

  if v_occ is distinct from new.date or coalesce(v_win, false) = false then
    return new;
  end if;

  v_date_label := to_char(new.date, 'YYYY/MM/DD');
  v_n := coalesce(new.nb_rappels_envoyes, 0);
  v_source := new.id::text || ':' || v_n::text;
  v_nom := coalesce(nullif(trim(v_nom), ''), 'الحصة');

  if v_n <= 1 then
    v_title := 'الحضور';
    v_body := format(
      'لم يُسجَّل حضور حصة «%s» بعد (%s). يمكنكم إتمام ذلك من التطبيق.',
      v_nom,
      v_date_label
    );
  else
    v_title := 'تسجيل الحضور';
    v_body := format(
      'ما زال بإمكانكم تسجيل حضور حصة «%s» ليوم %s من التطبيق.',
      v_nom,
      v_date_label
    );
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
      v_superviseur,
      'presence',
      'presence_rappel',
      v_title,
      v_body,
      jsonb_build_object(
        'screen', 'SupervisorAttendanceDetail',
        'params', jsonb_build_object(
          'seanceId', new.seance_id,
          'sessionDate', v_date_label,
          'readOnly', false,
          'groupName', v_nom,
          'markingWindowEnd', v_window_end
        ),
        'seance_id', new.seance_id,
        'date', new.date,
        'event_type', 'presence_rappel'
      ),
      'presence_rappels',
      v_source
    );

    update public.presence_rappels
    set push_sent_at = now()
    where id = new.id;
  exception
    when unique_violation then
      update public.presence_rappels
      set push_sent_at = coalesce(push_sent_at, now())
      where id = new.id;
    when others then
      raise notice 'notify_presence_rappel: %', SQLERRM;
  end;

  return new;
end;
$$;

create or replace function private.notify_presence_absence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nom text;
  v_date_label text;
begin
  if new.statut::text is distinct from 'absent' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.statut::text is not distinct from 'absent' then
    return new;
  end if;

  select s.nom into v_nom
  from public.seances s
  where s.id = new.seance_id;

  v_nom := coalesce(nullif(trim(v_nom), ''), 'الحصة');
  v_date_label := to_char(new.date, 'YYYY/MM/DD');

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
      new.membre_id,
      'presence',
      'presence_absence',
      'الحصة',
      format(
        'سُجِّل غياب في حصة «%s» يوم %s. إن كان هناك عذر، يمكن مراجعة المشرف.',
        v_nom,
        v_date_label
      ),
      jsonb_build_object(
        'screen', 'MemberDashboardScreen',
        'params', jsonb_build_object(),
        'seance_id', new.seance_id,
        'date', new.date,
        'event_type', 'presence_absence'
      ),
      'presences',
      new.id::text
    );
  exception
    when unique_violation then
      null;
    when others then
      raise notice 'notify_presence_absence: %', SQLERRM;
  end;

  return new;
end;
$$;

create or replace function public.enqueue_test_notification(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_source text := gen_random_uuid()::text;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if p_user_id is null then
    raise exception 'معرّف المستخدم مفقود';
  end if;
  if p_user_id is distinct from v_uid and not private.is_admin() then
    raise exception 'غير مصرح';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'المستخدم غير موجود';
  end if;

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
    p_user_id,
    'systeme',
    'test_push',
    'تمّ',
    'هذا إشعار تجريبي — إن ظهر لكم فالقناة إلى الجهاز سليمة.',
    jsonb_build_object('screen', 'NotificationInbox'),
    'notifications',
    v_source
  )
  returning id into v_id;

  return v_id;
end;
$$;

notify pgrst, 'reload schema';
