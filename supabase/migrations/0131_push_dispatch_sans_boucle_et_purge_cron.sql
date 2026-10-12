-- 0131_push_dispatch_sans_boucle_et_purge_cron.sql
--
-- Cause : quand l'Edge Function send-push ne tourne pas, la branche cron de
-- private.invoke_send_push réécrit dispatch_request_id sur toutes les
-- notifications en attente, chaque minute, sans plafond (521 868 mises à jour,
-- août-sept. 2026). send-push incrémente déjà push_attempts (markProcessed) :
-- on ne touche ni à send-push ni à cet incrément.
--
-- Trois changements :
-- 1. invoke_send_push n'écrit plus dispatch_request_id lorsque p_ids est null.
-- 2. dispatch_pending_push et claim_pending_push_notifications ignorent les
--    notifications créées depuis plus de 24 heures.
-- 3. Purge quotidienne de cron.job_run_details au-delà de 7 jours, à 03:00.
--
-- Seules les notifications envoyées par le trigger AFTER INSERT gardent un
-- dispatch_request_id. supabase/scripts/notifications-lot0-verify.sql ne verra
-- plus les relances cron.
--
-- Sources recopiées : 0089 (invoke_send_push), 0088 (dispatch_pending_push,
-- claim_pending_push_notifications). Aucun grant ni revoke.

create or replace function private.invoke_send_push(
  p_ids uuid[] default null,
  p_require_secret boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_key text;
  v_dispatch text;
  v_url text;
  v_headers jsonb;
  v_body jsonb;
  v_timeout int := 15000;
  v_request_id bigint;
begin
  v_key := private.vault_secret('service_role_key');
  if v_key is null or length(trim(v_key)) = 0 then
    if p_require_secret then
      raise exception 'Vault service_role_key absent';
    end if;
    raise notice 'Vault service_role_key absent — send-push non invoqué';
    return;
  end if;

  v_dispatch := private.vault_secret('push_dispatch_secret');
  if v_dispatch is null or length(trim(v_dispatch)) = 0 then
    if p_require_secret then
      raise exception 'Vault push_dispatch_secret absent';
    end if;
    raise notice 'Vault push_dispatch_secret absent — send-push non invoqué';
    return;
  end if;

  v_base := nullif(trim(coalesce(private.vault_secret('project_url'), '')), '');
  if v_base is null then
    v_base := 'https://okqmyayjeiwzjkwlkmia.supabase.co';
  end if;
  v_url := rtrim(v_base, '/') || '/functions/v1/send-push';

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_key,
    'x-dispatch-secret', v_dispatch
  );
  if p_ids is null then
    v_body := '{}'::jsonb;
  else
    v_body := jsonb_build_object('ids', to_jsonb(p_ids));
  end if;

  -- Identité live : url, body, params, headers, timeout_milliseconds.
  -- params omis (défaut '{}'). Qualification net. : search_path = public.
  v_request_id := net.http_post(
    url => v_url,
    body => v_body,
    headers => v_headers,
    timeout_milliseconds => v_timeout
  );

  -- Branche cron (p_ids null) : ne pas réécrire dispatch_request_id chaque minute.
  if p_ids is not null then
    update public.notifications
    set dispatch_request_id = v_request_id
    where id = any(p_ids);
  end if;

  raise notice 'send-push request_id=% url=%', v_request_id, v_url;
end;
$$;

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
      and n.created_at > now() - interval '24 hours'
    limit 1
  ) then
    return;
  end if;
  perform private.invoke_send_push(null, true);
end;
$$;

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
      and n.created_at > now() - interval '24 hours'
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

select cron.schedule(
  'purge-cron-history',
  '0 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

-- Vérification post-exécution (à lancer à part) :
-- select
--   position('if p_ids is not null' in pg_get_functiondef('private.invoke_send_push(uuid[], boolean)'::regprocedure)) > 0 as invoke_ok,
--   position('interval ''24 hours''' in pg_get_functiondef('private.dispatch_pending_push()'::regprocedure)) > 0 as dispatch_ok,
--   position('interval ''24 hours''' in pg_get_functiondef('public.claim_pending_push_notifications(uuid[], integer)'::regprocedure)) > 0 as claim_ok;
-- select jobid, jobname, schedule, active from cron.job where jobname = 'purge-cron-history';
-- Attendu : trois true et un job actif.
