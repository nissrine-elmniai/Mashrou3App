-- 0070_presence_rappel_notifications.sql
-- Rappel « marquer la présence » → superviseur de la séance.
-- Ne modifie pas check_presence_reminders() ni la table notifications (hors INSERT).
--
-- source_id = {presence_rappels.id}:{nb_rappels_envoyes}
--   L'id seul bloquerait les relances 12h (même ligne upsert). Le compteur
--   distingue chaque envoi. UUID sans « : », le format est non ambigu.
--
-- Job (0034) : ON CONFLICT DO UPDATE … WHERE dernier_rappel ≥ 12 h.
--   Si WHERE faux, Postgres n'UPDATE PAS la ligne (pas de trigger UPDATE).
--   WHEN (nb DISTINCT) : filet pour notre UPDATE de push_sent_at (trace,
--   même nb) et pour un job futur sans WHERE.
--
-- Garde 48h = compute_current_seance_occurrence + get_seance_planning_at
-- (mêmes fonctions que le job, TZ Casablanca). Pas de calcul de date maison.
-- CREATE TRIGGER ne rejoue pas les lignes existantes.
--
-- push_sent_at = TRACE d'enqueue, jamais une condition d'insertion.
-- Dédup = source_id UNIQUE. Une garde sur push_sent_at bloquerait la relance 12h.

alter table public.presence_rappels
  add column if not exists push_sent_at timestamptz;

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

  -- Fenêtre 48h : identique au job (Casablanca dans les helpers, pas UTC maison).
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
  v_source := new.id::text || ':' || new.nb_rappels_envoyes::text;
  v_nom := coalesce(nullif(trim(v_nom), ''), 'الحصة');

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
      'تذكير بتسجيل الحضور',
      format(
        'حصة «%s» ليوم %s — يرجى تسجيل الحضور.',
        v_nom,
        v_date_label
      ),
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

    -- Trace uniquement (pas lue pour décider d'insérer).
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

drop trigger if exists trg_presence_rappels_notify on public.presence_rappels;
drop trigger if exists trg_presence_rappels_notify_ins on public.presence_rappels;
drop trigger if exists trg_presence_rappels_notify_upd on public.presence_rappels;

create trigger trg_presence_rappels_notify_ins
  after insert on public.presence_rappels
  for each row
  execute function private.notify_presence_rappel();

create trigger trg_presence_rappels_notify_upd
  after update on public.presence_rappels
  for each row
  when (new.nb_rappels_envoyes is distinct from old.nb_rappels_envoyes)
  execute function private.notify_presence_rappel();

revoke all on function private.notify_presence_rappel() from public;
grant execute on function private.notify_presence_rappel() to postgres, service_role;

notify pgrst, 'reload schema';
