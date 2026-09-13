-- 0073_quiet_hours.sql
-- SUPERSEDE : 0074_quiet_hours_fixed.sql (plage fixe 22:00–07:00, pas de prefs).
-- Ne plus coller ce fichier. Conservé pour l'historique du repo.

-- quiet_hours_start / quiet_hours_end (type time, 0066) = heure murale
-- Africa/Casablanca — même constante que 0034 (planning séances).
-- NULL / NULL = pas de plage (comportement actuel).
-- start = end = plage vide (pas 24 h).
-- start > end = plage à cheval sur minuit (cas normal 22:00 → 07:00).
--
-- Filtre dans le CLAIM et dans dispatch_pending_push, pas seulement
-- dans l'Edge : sinon le cron */1 invoquerait send-push toute la nuit
-- (claimed_at relâché → exists true → 480 boots à vide).

create or replace function private.in_quiet_hours(
  p_start time,
  p_end time,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_now time;
begin
  if p_start is null or p_end is null then
    return false;
  end if;
  -- Même heure aux deux bornes : pas de plage (évite un mute 24 h par erreur).
  if p_start = p_end then
    return false;
  end if;
  v_now := timezone('Africa/Casablanca', p_at)::time;
  if p_start < p_end then
    return v_now >= p_start and v_now < p_end;
  end if;
  return v_now >= p_start or v_now < p_end;
end;
$$;

create or replace function private.user_in_quiet_hours(
  p_user_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select private.in_quiet_hours(p.quiet_hours_start, p.quiet_hours_end, p_at)
      from public.notification_preferences p
      where p.user_id = p_user_id
    ),
    false
  );
$$;

drop function if exists public.claim_pending_push_notifications(uuid[], integer);
create or replace function public.claim_pending_push_notifications(
  p_ids uuid[] default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  user_id uuid,
  category text,
  event_type text,
  title text,
  body text,
  payload jsonb,
  push_sent_at timestamptz,
  push_attempts integer,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_ids uuid[] := p_ids;
begin
  if v_ids is not null and cardinality(v_ids) = 0 then
    v_ids := null;
  end if;

  return query
  with picked as materialized (
    select n.id
    from public.notifications n
    where n.push_sent_at is null
      and n.push_attempts < 3
      and (n.claimed_at is null or n.claimed_at < now() - interval '2 minutes')
      and (v_ids is null or n.id = any(v_ids))
      and not private.user_in_quiet_hours(n.user_id)
    order by n.created_at asc
    limit v_limit
    for update of n skip locked
  )
  update public.notifications as n
  set claimed_at = now()
  from picked
  where n.id = picked.id
  returning
    n.id,
    n.user_id,
    n.category,
    n.event_type,
    n.title,
    n.body,
    n.payload,
    n.push_sent_at,
    n.push_attempts,
    n.read_at;
end;
$$;

revoke all on function public.claim_pending_push_notifications(uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.claim_pending_push_notifications(uuid[], integer)
  to postgres, service_role;

create or replace function private.dispatch_pending_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.notifications n
    where n.push_sent_at is null
      and n.push_attempts < 3
      and (n.claimed_at is null or n.claimed_at < now() - interval '2 minutes')
      and not private.user_in_quiet_hours(n.user_id)
    limit 1
  ) then
    return;
  end if;
  perform private.invoke_send_push(null, true);
end;
$$;

-- Accélérateur INSERT : pas d'appel Edge si le destinataire est en plage calme.
create or replace function private.notifications_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.user_in_quiet_hours(new.user_id) then
    return new;
  end if;
  begin
    perform private.invoke_send_push(array[new.id], false);
  exception
    when others then
      raise notice 'notifications_after_insert: %', SQLERRM;
  end;
  return new;
end;
$$;

notify pgrst, 'reload schema';
