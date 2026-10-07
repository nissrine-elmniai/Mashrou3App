-- 0129 : une seule surcharge de send_alert, et un push au texte complet.
--
-- send_alert(text, text) et send_alert(text, text, text) portaient les mêmes
-- noms p_message et p_audience. Un appel PostgREST à deux arguments nommés
-- était ambigu. Le client envoie toujours les trois arguments
-- (p_saison_id peut être null). On retire la surcharge à deux arguments.
-- send_alert(text, text, text) n'est pas modifiée.
--
-- Le trigger alerts_sync_legacy_columns écrit title = left(message, 120).
-- notify_alerte_nouvelle lisait title en premier : le push était tronqué.
-- Le corps de notification prend maintenant message, puis body, puis title.

drop function if exists public.send_alert(text, text);

-- Corps identique à 0085, sauf l'ordre du coalesce du corps de notification.
create or replace function private.notify_alerte_nouvelle()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_user_id uuid;
  v_actor   uuid := auth.uid();
  v_body    text;
begin
  -- message complet d'abord : title est tronqué à 120 caractères par
  -- alerts_sync_legacy_columns. body puis title restent des replis.
  v_body := coalesce(
    nullif(trim(new.message), ''),
    nullif(trim(new.body), ''),
    nullif(trim(new.title), ''),
    'يرجى فتح التطبيق للاطلاع.'
  );

  for v_user_id in
    select p.id
    from public.profiles p
    where p.account_status = 'active'
      and (
        -- Ciblage individuel : prime sur audience.
        (new.target_user_id is not null and p.id = new.target_user_id)
        or (
          new.target_user_id is null
          and (
            new.audience = 'all'
            or (new.audience = 'members'     and (p.role = 'member'     or 'member'     = any (p.roles)))
            or (new.audience = 'supervisors' and (p.role = 'supervisor' or 'supervisor' = any (p.roles)))
            or (new.audience = 'admin'       and (p.role = 'admin'      or 'admin'      = any (p.roles)))
          )
        )
      )
  loop
    -- L'admin qui publie l'alerte ne se la notifie pas à lui-même
    -- (cas audience = 'all' ou 'admin').
    if v_user_id is distinct from v_actor then
      begin
        insert into public.notifications (
          user_id, category, event_type, title, body,
          payload, source_table, source_id
        )
        values (
          v_user_id,
          'alertes',
          'alerte_nouvelle',
          'تنبيه جديد من الإدارة',
          v_body,
          jsonb_build_object('event_type', 'alerte_nouvelle'),
          'alerts',
          new.id
        );
      exception
        when unique_violation then null;
        when others then
          raise notice 'notify_alerte_nouvelle (%): %', v_user_id, SQLERRM;
      end;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function private.notify_alerte_nouvelle() from public;
grant execute on function private.notify_alerte_nouvelle() to postgres, service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Vérifications (SQL Editor, ne pas exécuter avec le fichier si on veut
-- seulement appliquer le DDL : ce bloc est en commentaire).
-- ---------------------------------------------------------------------------
--
-- Surcharges de public.send_alert : une seule ligne, arguments text, text, text.
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname = 'send_alert';
--
-- Corps de notification : message, puis body, puis title.
-- select pg_get_functiondef('private.notify_alerte_nouvelle()'::regprocedure);
