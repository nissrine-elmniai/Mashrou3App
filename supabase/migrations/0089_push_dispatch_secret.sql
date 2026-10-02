-- 0089_push_dispatch_secret.sql
-- Auth du dispatch : secret dédié Vault push_dispatch_secret, envoyé dans
-- x-dispatch-secret. Authorization Bearer service_role_key est conservé
-- pour la passerelle verify_jwt.
--
-- Base : seule définition du dépôt, supabase/migrations/0068_notifications_dispatch.sql
-- (aucune migration ultérieure ne réécrit private.invoke_send_push).
-- La sortie live de pg_get_functiondef n'était pas fournie.
--
-- Même signature, SECURITY DEFINER, search_path. Pas de DROP.

begin;

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

  if p_ids is null then
    update public.notifications
    set dispatch_request_id = v_request_id
    where push_sent_at is null
      and push_attempts < 3
      and (claimed_at is null or claimed_at < now() - interval '2 minutes');
  else
    update public.notifications
    set dispatch_request_id = v_request_id
    where id = any(p_ids);
  end if;

  raise notice 'send-push request_id=% url=%', v_request_id, v_url;
end;
$$;

commit;

-- Vérification post-exécution (à lancer à part, après le commit) :
-- select pg_get_functiondef('private.invoke_send_push(uuid[], boolean)'::regprocedure);
-- select position('x-dispatch-secret' in pg_get_functiondef('private.invoke_send_push(uuid[], boolean)'::regprocedure)) > 0 as has_dispatch_header;
-- select position('push_dispatch_secret' in pg_get_functiondef('private.invoke_send_push(uuid[], boolean)'::regprocedure)) > 0 as reads_dispatch_secret;
-- select position('service_role_key' in pg_get_functiondef('private.invoke_send_push(uuid[], boolean)'::regprocedure)) > 0 as keeps_service_role;
-- select private.vault_secret('push_dispatch_secret') is not null as vault_dispatch_present;
-- select private.vault_secret('service_role_key') is not null as vault_service_role_present;
