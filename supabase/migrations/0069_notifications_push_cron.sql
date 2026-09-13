-- 0069_notifications_push_cron.sql
-- Déployer send-push AVANT 0068 (le trigger envoie dès le 1er INSERT).
-- Ce fichier : EN DERNIER, après Vault service_role_key + 0065–0068.
-- dispatch_pending_push() lève une exception si le secret est absent.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'notifications-push-dispatch';

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'notifications-push-dispatch',
    '* * * * *',
    $cron$select private.dispatch_pending_push();$cron$
  );
end $$;
