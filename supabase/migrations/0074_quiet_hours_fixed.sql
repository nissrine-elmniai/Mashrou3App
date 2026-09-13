-- 0074_quiet_hours_fixed.sql
-- Plage calme FIXE pour tout le monde : 22:00 → 07:00, heure murale Maroc.
-- Fuseau : 'Africa/Casablanca' (même constante que 0034_presence_rappels_job).
-- Colonnes notification_preferences.quiet_hours_* : non lues, non écrites.
-- Toutes les catégories, y compris presence. Aucune dérogation.
--
-- Pendant la plage : l'inbox / le badge restent immédiats (INSERT inchangé).
-- Seul le PUSH est reporté. claimed_at et push_attempts non touchés
-- (le claim ne réserve aucune ligne).
--
-- Filtre dans le CLAIM + early-return de dispatch_pending_push + skip du
-- trigger INSERT. Le claim seul ne suffit pas : le cron */1 verrait encore
-- des lignes pending et invoquerait l'Edge à vide ~540 fois / nuit.
--
-- Si 0073 (plage par utilisateur) a été collé : ce fichier le remplace.

create or replace function private.in_project_quiet_hours(
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
  -- Même expression que 0034 : timezone('Africa/Casablanca', timestamptz).
  v_now := timezone('Africa/Casablanca', p_at)::time;
  -- 22:00 inclus, 07:00 exclus (à 07:00 le claim reprend).
  return v_now >= time '22:00' or v_now < time '07:00';
end;
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
  if private.in_project_quiet_hours() then
    return;
  end if;

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
  if private.in_project_quiet_hours() then
    return;
  end if;
  if not exists (
    select 1
    from public.notifications n
    where n.push_sent_at is null
      and n.push_attempts < 3
      and (n.claimed_at is null or n.claimed_at < now() - interval '2 minutes')
    limit 1
  ) then
    return;
  end if;
  perform private.invoke_send_push(null, true);
end;
$$;

create or replace function private.notifications_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.in_project_quiet_hours() then
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
