-- 0085_alertes_notifications.sql
-- Notification de nouvelle alerte administrative (تنبيه).
--
-- PÉRIMÈTRE VOLONTAIREMENT MINIMAL : un push informatif, rien d'autre.
-- Le gate bloquant (modal + accusé de réception) reste inchangé, et la
-- gestion des alertes dans l'app n'est pas touchée.
--
-- Pourquoi category = 'alertes' et pas 'systeme' :
-- l'inbox et le badge excluent la catégorie 'alertes' depuis le lot 1.6,
-- justement parce que les تنبيهات ont leur propre mécanisme bloquant.
-- En restant sur 'alertes', la ligne existe en base, le push part, mais
-- aucune entrée ne s'ajoute dans l'inbox — donc aucun second point d'entrée
-- à côté du modal. C'est exactement « un push, rien ne change par ailleurs ».
--
-- Ce que le push apporte réellement : app fermée. Une alerte publiée le soir
-- n'était découverte qu'à la prochaine ouverture.
--
-- Ciblage live constaté : audience ∈ {all, members, supervisors, admin},
-- plus une colonne target_user_id (nullable) qui prime quand elle est
-- renseignée. profiles.role ∈ {member, supervisor, admin}.
--
-- Pas de payload.screen : une alerte n'a pas d'écran, c'est un modal qui
-- s'affiche de lui-même. Le tap ouvre l'app, le gate prend le relais.

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
  -- title est NOT NULL ; message et body servent de repli si le titre
  -- se révélait vide en pratique.
  v_body := coalesce(
    nullif(trim(new.title), ''),
    nullif(trim(new.message), ''),
    nullif(trim(new.body), ''),
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

drop trigger if exists notify_alerts_nouvelle on public.alerts;
create trigger notify_alerts_nouvelle
  after insert on public.alerts
  for each row
  execute function private.notify_alerte_nouvelle();

revoke all on function private.notify_alerte_nouvelle() from public;
grant execute on function private.notify_alerte_nouvelle() to postgres, service_role;

-- ===========================================================================
-- Vérifications post-collage
-- ===========================================================================
--
-- select tgname, pg_get_triggerdef(oid, true)
-- from pg_trigger where tgrelid = 'public.alerts'::regclass and not tgisinternal;
--
-- -- Combien de destinataires par audience aujourd'hui ?
-- select count(*) filter (where account_status = 'active') as tous,
--        count(*) filter (where account_status = 'active'
--                           and (role = 'member' or 'member' = any(roles))) as membres,
--        count(*) filter (where account_status = 'active'
--                           and (role = 'supervisor' or 'supervisor' = any(roles))) as superviseurs
-- from public.profiles;
--
-- ---------------------------------------------------------------------------
-- Plan de test
-- ---------------------------------------------------------------------------
-- 1) begin; insert alerts audience 'members'
--    → une notification par membre actif, aucune au superviseur ni à l'admin.
--    rollback;
-- 2) audience 'all' publiée par l'admin
--    → tous sauf l'admin lui-même (garde auth.uid()).
-- 3) target_user_id renseigné avec audience 'all'
--    → une seule notification, au destinataire ciblé.
-- 4) La ligne ne doit PAS apparaître dans l'inbox ni dans le badge
--    (catégorie 'alertes' exclue depuis le lot 1.6). Vérifier sur l'appareil.
-- 5) Tap sur le push → l'app s'ouvre, le modal du gate s'affiche.
--    C'est le seul point qui dépend du client : vérifier que le gate se
--    déclenche bien au retour au premier plan, pas seulement au démarrage.
-- ===========================================================================