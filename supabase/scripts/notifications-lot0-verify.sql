-- Vérifications LOT 0 — à coller dans SQL Editor APRÈS 0065–0069.
-- Lecture seule. Aucun INSERT ici (le test d'envoi est enqueue_test_notification).

-- 1) Colonnes (source_id = text, claimed_at, dispatch_request_id)
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('notifications', 'notification_preferences', 'push_tokens')
order by table_name, ordinal_position;

-- 2) Policies (pas de FOR ALL sur notifications)
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where tablename in ('notifications', 'notification_preferences', 'push_tokens')
order by tablename, policyname;

-- 3) Privileges table
select
  t.tablename,
  r.rolname,
  has_table_privilege(r.rolname, format('public.%I', t.tablename), 'SELECT') as can_select,
  has_table_privilege(r.rolname, format('public.%I', t.tablename), 'INSERT') as can_insert,
  has_table_privilege(r.rolname, format('public.%I', t.tablename), 'UPDATE') as can_update,
  has_table_privilege(r.rolname, format('public.%I', t.tablename), 'DELETE') as can_delete
from (values ('notifications'), ('notification_preferences'), ('push_tokens')) as t(tablename)
cross join (values ('authenticated'), ('anon'), ('service_role')) as r(rolname)
order by t.tablename, r.rolname;

-- 4) Grant colonne read_at (client)
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'notifications'
  and grantee in ('authenticated', 'anon', 'service_role')
order by grantee, column_name, privilege_type;

-- 5) Index
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('notifications', 'notification_preferences', 'push_tokens')
order by tablename, indexname;

-- 6) Jobs cron
select jobid, jobname, schedule, command
from cron.job
where jobname in ('notifications-push-dispatch', 'presence-reminder-check');

-- 7) RPCs
select n.nspname as schema, p.proname as function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in (
  'upsert_push_token',
  'enqueue_test_notification',
  'invoke_send_push',
  'dispatch_pending_push',
  'claim_pending_push_notifications'
)
order by n.nspname, p.proname;

-- 8) Realtime
select pubname, schemaname, tablename
from pg_publication_tables
where tablename = 'notifications';

-- 9) Trace pg_net — net._http_response est purgée automatiquement au bout
--    de quelques heures ; exécuter cette requête juste après le test d'envoi.
select
  n.id as notification_id,
  n.dispatch_request_id,
  r.status_code,
  r.error_msg,
  r.created
from public.notifications n
left join net._http_response r on r.id = n.dispatch_request_id
where n.dispatch_request_id is not null
order by n.created_at desc
limit 20;

-- 10) Test d'envoi (après Vault + deploy send-push). Remplacer l'uuid profiles :
-- select public.enqueue_test_notification('<uuid>');
-- select id, user_id, category, event_type, source_id, claimed_at,
--        dispatch_request_id, push_sent_at, push_error, push_attempts, read_at
-- from public.notifications
-- order by created_at desc
-- limit 10;
