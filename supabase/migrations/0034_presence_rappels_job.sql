-- Migration 0034 : rappels de présence (12h) via presence_rappels + pg_cron
-- À exécuter manuellement dans Supabase → SQL Editor.
-- Ne modifie pas presences/seances (sauf contraintes sur presence_rappels).

-- ---------------------------------------------------------------------------
-- 1a. Contraintes idempotentes sur presence_rappels
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.presence_rappels'::regclass
      and contype = 'f'
      and conname = 'presence_rappels_seance_id_fkey'
  ) then
    alter table public.presence_rappels
      add constraint presence_rappels_seance_id_fkey
      foreign key (seance_id) references public.seances (id) on delete cascade;
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.presence_rappels'::regclass
      and c.contype = 'u'
      and (
        c.conname = 'presence_rappels_seance_id_date_key'
        or exists (
          select 1
          from unnest(c.conkey) with ordinality as cols(attnum, ord)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = cols.attnum
          where a.attname in ('seance_id', 'date')
          group by c.oid
          having count(distinct a.attname) = 2
        )
      )
  ) then
    alter table public.presence_rappels
      add constraint presence_rappels_seance_id_date_key unique (seance_id, date);
  end if;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 1b. RLS presence_rappels
-- ---------------------------------------------------------------------------

alter table if exists public.presence_rappels enable row level security;

grant select on table public.presence_rappels to authenticated;

drop policy if exists "presence_rappels_select_superviseur" on public.presence_rappels;
create policy "presence_rappels_select_superviseur"
  on public.presence_rappels for select
  using (
    exists (
      select 1
      from public.seances s
      where s.id = presence_rappels.seance_id
        and s.superviseur_id = auth.uid()
    )
  );

drop policy if exists "presence_rappels_admin_all" on public.presence_rappels;
create policy "presence_rappels_admin_all"
  on public.presence_rappels for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers : jour → DOW (0 = dimanche, aligné JS getDay / PG extract(dow))
-- ---------------------------------------------------------------------------

create or replace function public.jour_text_to_dow(p_jour text)
returns integer
language sql
immutable
as $$
  select case trim(coalesce(p_jour, ''))
    when 'الأحد' then 0
    when 'الاثنين' then 1
    when 'الثلاثاء' then 2
    when 'الأربعاء' then 3
    when 'الخميس' then 4
    when 'الجمعة' then 5
    when 'السبت' then 6
    else null
  end;
$$;

-- Planning en vigueur à un instant t (historique 0033 ou champs courants seances).
create or replace function public.get_seance_planning_at(p_seance_id uuid, p_at timestamptz)
returns table (jour text, heure_debut time)
language sql
stable
as $$
  select h.jour::text, h.heure_debut
  from public.seance_planning_history h
  where h.seance_id = p_seance_id
    and h.valide_depuis <= p_at
    and h.valide_jusqu_a > p_at
  union all
  select s.jour::text, s.heure_debut
  from public.seances s
  where s.id = p_seance_id
    and s.planning_valide_depuis <= p_at
    and not exists (
      select 1
      from public.seance_planning_history h2
      where h2.seance_id = p_seance_id
        and h2.valide_depuis <= p_at
        and h2.valide_jusqu_a > p_at
    )
  limit 1;
$$;

-- Occurrence courante + fenêtre 48h (port getLatestSeanceOccurrence / isOccurrenceMarkingWindowOpen).
create or replace function public.compute_current_seance_occurrence(
  p_jour text,
  p_heure_debut time,
  p_ref timestamptz default now()
)
returns table (
  occurrence_date date,
  session_start timestamptz,
  window_end timestamptz,
  within_marking_window boolean
)
language plpgsql
stable
as $$
declare
  v_tz constant text := 'Africa/Casablanca';
  v_ref_local timestamp;
  v_ref_date date;
  v_dow integer;
  v_target_dow integer;
  v_this_week_date date;
  v_occurrence_date date;
  v_session_start timestamptz;
  v_window_end timestamptz;
  v_heure time;
begin
  v_target_dow := public.jour_text_to_dow(p_jour);
  if v_target_dow is null then
    return;
  end if;

  v_ref_local := timezone(v_tz, p_ref);
  v_ref_date := v_ref_local::date;
  v_dow := extract(dow from v_ref_date)::integer;
  v_heure := coalesce(p_heure_debut, time '00:00');

  v_this_week_date := v_ref_date + (((v_target_dow - v_dow + 7) % 7) * interval '1 day');

  v_session_start := make_timestamptz(
    extract(year from v_this_week_date)::integer,
    extract(month from v_this_week_date)::integer,
    extract(day from v_this_week_date)::integer,
    extract(hour from v_heure)::integer,
    extract(minute from v_heure)::integer,
    0,
    v_tz
  );

  if p_ref < v_session_start then
    v_occurrence_date := (v_this_week_date - interval '7 days')::date;
    v_session_start := v_session_start - interval '7 days';
  else
    v_occurrence_date := v_this_week_date;
  end if;

  v_window_end := v_session_start + interval '48 hours';

  return query
  select
    v_occurrence_date,
    v_session_start,
    v_window_end,
    (p_ref >= v_session_start and p_ref <= v_window_end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1c. Job : check_presence_reminders + pg_cron
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;

create or replace function public.check_presence_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_jour text;
  v_heure_debut time;
  v_occurrence_date date;
  v_within_window boolean;
  v_already_marked boolean;
begin
  for r in
    select s.id as seance_id
    from public.seances s
    where s.statut = 'active'
  loop
    select p.jour, p.heure_debut
    into v_jour, v_heure_debut
    from public.get_seance_planning_at(r.seance_id, now()) p;

    if v_jour is null then
      continue;
    end if;

    select o.occurrence_date, o.within_marking_window
    into v_occurrence_date, v_within_window
    from public.compute_current_seance_occurrence(v_jour, v_heure_debut, now()) o;

    if v_occurrence_date is null or not v_within_window then
      continue;
    end if;

    select exists (
      select 1
      from public.presences p
      where p.seance_id = r.seance_id
        and p.date = v_occurrence_date
        and p.statut::text in ('present', 'absent')
    )
    into v_already_marked;

    if v_already_marked then
      continue;
    end if;

    insert into public.presence_rappels (seance_id, date, dernier_rappel_le, nb_rappels_envoyes)
    values (r.seance_id, v_occurrence_date, now(), 1)
    on conflict (seance_id, date) do update
    set
      dernier_rappel_le = excluded.dernier_rappel_le,
      nb_rappels_envoyes = public.presence_rappels.nb_rappels_envoyes + 1
    where public.presence_rappels.dernier_rappel_le is null
       or now() - public.presence_rappels.dernier_rappel_le >= interval '12 hours';
  end loop;

  -- Purge : occurrences datant de plus de 60 jours (fenêtre 48h longue close).
  delete from public.presence_rappels
  where date < (current_date - interval '60 days');
end;
$$;

revoke all on function public.check_presence_reminders() from public;
grant execute on function public.check_presence_reminders() to postgres, service_role;

-- Vérification toutes les 6 h : le job applique l'intervalle 12 h en interne ;
-- une cadence ≤ 12 h évite de rater le premier rappel eligible dans la fenêtre 48 h
-- (ex. séance à 18h → 1er rappel possible à 18h, prochain cron à minuit).
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
    '0 */6 * * *',
    $cron$select public.check_presence_reminders();$cron$
  );
exception
  when undefined_table then
    raise notice 'pg_cron non disponible : planifier check_presence_reminders() manuellement.';
  when insufficient_privilege then
    raise notice 'Privilèges pg_cron insuffisants : planifier check_presence_reminders() via le dashboard Supabase.';
end $$;
