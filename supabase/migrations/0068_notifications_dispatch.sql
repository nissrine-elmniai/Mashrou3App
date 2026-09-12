-- 0068_notifications_dispatch.sql
-- Trigger AFTER INSERT (accélérateur) + claim atomique + RPC de test.
-- Le job cron est dans 0069 (après secret Vault).
--
-- L'échec HTTP / secret manquant ne doit JAMAIS rollback l'INSERT métier
-- (chemin trigger : NOTICE + return). Le chemin cron (0069) lève une
-- exception si service_role_key est absent.
--
-- Secret Vault (manuel, avant 0069) :
--   service_role_key  = JWT service_role du projet
-- Optionnel :
--   project_url       = https://<ref>.supabase.co
--
-- pg_net : net.http_post uniquement (arguments nommés, vérifiés live).
-- Déployer send-push AVANT d'exécuter ce fichier, sinon les 1ers appels font 404.

create or replace function private.vault_secret(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_val text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute
    'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_val
    using p_name;
  return v_val;
exception
  when others then
    return null;
end;
$$;

-- Réserve des lignes pour send-push (une Edge à la fois).
-- Reprise : claimed_at NULL ou plus vieux que 2 minutes.
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
  push_attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_ids uuid[] := p_ids;
begin
  -- [] (cron / body vide) = file globale, pas « aucune ligne ».
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
    n.push_attempts;
end;
$$;

revoke all on function public.claim_pending_push_notifications(uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.claim_pending_push_notifications(uuid[], integer)
  to postgres, service_role;

drop function if exists private.invoke_send_push(uuid[]);
drop function if exists private.invoke_send_push(uuid[], boolean);

-- postgres (SQL Editor / cron.job.username) a déjà USAGE+EXECUTE sur net.http_post (live).
grant usage on schema net to postgres, supabase_admin;
grant execute on function net.http_post(text, jsonb, jsonb, jsonb, integer)
  to postgres, supabase_admin;

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

  v_base := nullif(trim(coalesce(private.vault_secret('project_url'), '')), '');
  if v_base is null then
    v_base := 'https://okqmyayjeiwzjkwlkmia.supabase.co';
  end if;
  v_url := rtrim(v_base, '/') || '/functions/v1/send-push';

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_key
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

create or replace function private.dispatch_pending_push()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.notifications
    where push_sent_at is null
      and push_attempts < 3
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    limit 1
  ) then
    return;
  end if;
  -- Chemin cron : secret obligatoire (exception, pas NOTICE).
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
  begin
    perform private.invoke_send_push(array[new.id], false);
  exception
    when others then
      raise notice 'notifications_after_insert: %', SQLERRM;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notifications_after_insert on public.notifications;
create trigger trg_notifications_after_insert
  after insert on public.notifications
  for each row
  execute function private.notifications_after_insert();

revoke all on function private.invoke_send_push(uuid[], boolean) from public;
revoke all on function private.dispatch_pending_push() from public;
grant execute on function private.invoke_send_push(uuid[], boolean)
  to postgres, service_role;
grant execute on function private.dispatch_pending_push()
  to postgres, service_role;

-- Validation lot 0 : insert une notif factice pour un user_id (soi-même, ou admin).
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
    'إشعار تجريبي',
    'إذا وصل هذا الإشعار فسلسلة الإرسال تعمل (قاعدة → Edge → Expo).',
    jsonb_build_object('screen', 'NotificationInbox'),
    'notifications',
    v_source
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enqueue_test_notification(uuid) from public;
grant execute on function public.enqueue_test_notification(uuid) to authenticated;

notify pgrst, 'reload schema';
