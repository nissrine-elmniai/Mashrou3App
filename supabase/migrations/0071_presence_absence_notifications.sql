-- 0071_presence_absence_notifications.sql
-- Absence enregistrée → le membre (pas le superviseur).
-- N absents dans un upsert feuille = N lignes trigger = N notifications membres.

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

  -- Upsert répété same statut : pas de 2e notif (WHEN + UNIQUE source_id = presences.id).
  if tg_op = 'UPDATE' and old.statut::text is not distinct from 'absent' then
    return new;
  end if;

  -- absent → present : pas de notif de correction (l'inbox garde le premier avis).
  -- present → absent : on arrive ici (old ≠ absent, new = absent).

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

drop trigger if exists trg_presences_notify_absence on public.presences;
create trigger trg_presences_notify_absence
  after insert or update on public.presences
  for each row
  execute function private.notify_presence_absence();

revoke all on function private.notify_presence_absence() from public;
grant execute on function private.notify_presence_absence() to postgres, service_role;

notify pgrst, 'reload schema';
