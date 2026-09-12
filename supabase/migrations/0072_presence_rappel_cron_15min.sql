-- 0072_presence_rappel_cron_15min.sql
-- 1) Cadence du job presence-reminder-check : */15 (au lieu de 0 */6).
--    check_presence_reminders() n'est PAS modifié : le ON CONFLICT …
--    WHERE dernier_rappel_le >= 12 h empêche tout UPDATE (donc tout
--    trigger) tant que 12 h ne sont pas écoulées. INSERT initial inchangé.
-- 2) Textes du trigger 0070 : 1er envoi vs relance (même event_type / source_id).
--
-- Borne basse de la fenêtre = heure_debut (inchangée). Avec */15 le 1er
-- rappel part ~15 min après le DÉBUT, pas après la fin : le texte nb<=1
-- reste donc neutre (pas « انتهت »). Décalage de la détection vers
-- heure_fin : à traiter plus tard — variante 1 (borne basse = heure_fin,
-- window_end = heure_debut + 48 h inchangé).

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
    v_title := 'الحضور لم يُسجَّل بعد';
    v_body := format(
      'حصة «%s» ليوم %s — الحضور لم يُسجَّل بعد.',
      v_nom,
      v_date_label
    );
  else
    v_title := 'تذكير بتسجيل الحضور';
    v_body := format(
      'تذكير رقم %s — حصة «%s» ليوم %s، لم يُسجَّل الحضور بعد.',
      v_n,
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

revoke all on function private.notify_presence_rappel() from public;
grant execute on function private.notify_presence_rappel() to postgres, service_role;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'presence-reminder-check';

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'presence-reminder-check',
    '*/15 * * * *',
    $cron$select public.check_presence_reminders();$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron non disponible : planifier check_presence_reminders() manuellement (*/15).';
  when insufficient_privilege then
    raise notice 'Privilèges pg_cron insuffisants : cadence */15 via le dashboard Supabase.';
end $$;

notify pgrst, 'reload schema';
