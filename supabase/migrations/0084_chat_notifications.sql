-- 0084_chat_notifications.sql
-- Lot 4 — Notifications catégorie « chat ».
-- À coller APRÈS 0083 (fermeture de RG6 en RLS) : sans lui, un message
-- admin<->membre techniquement possible produirait une notification.
--
-- Schéma live vérifié :
--   messages             : id TEXT, sender_id, recipient_id, seance_id,
--                          contenu, image_url, read_at, created_at
--                          (+ colonnes legacy from_user_id/to_user_id/body
--                           remplies par le trigger BEFORE messages_sync_legacy_columns)
--   chat_group_messages  : pas de read_at par ligne ; lecture suivie par
--                          watermark dans chat_group_reads
--   chat_group_members   : PK (group_id, membre_id), rôle admin/member
--   profiles.role        : 'member' | 'supervisor' | 'admin' (anglais)
--
-- COLLAPSE — le cœur de ce lot. La règle « jamais un push par ligne » est
-- appliquée par l'index UNIQUE partiel (user_id, event_type, source_id),
-- avec un bucket de 10 minutes dans le source_id. Mesuré à l'audit :
-- 12 INSERT en 3 secondes (admin -> superviseur, 13/09 21:42:55-58).
-- Avec ce bucket : 1 push au lieu de 12.
--
-- Conséquence assumée : le push ne porte PAS le texte du message, puisqu'un
-- collapse peut en couvrir douze. Seulement « رسالة جديدة من X ».
--
-- BROADCAST : sendBroadcastToMembers fait N INSERT 1-à-1 vers N destinataires
-- distincts. Chacun a son propre source_id, donc un push chacun — la règle
-- « pas N pushes pour un seul texte » est respectée sans code spécifique.
--
-- read_at n'est jamais un filtre à l'INSERT : il vaut toujours NULL à ce
-- moment (le destinataire marque lu plus tard, à l'ouverture du fil).
-- C'est le collapse qui évite le bruit, pas l'accusé de lecture.

-- ---------------------------------------------------------------------------
-- Helper : bucket de collapse, 10 minutes
-- Change la constante ici pour ajuster la fenêtre — aucune autre modification.
-- ---------------------------------------------------------------------------

create or replace function private.chat_bucket(p_at timestamptz)
returns text
language sql
immutable
as $$
  select (floor(extract(epoch from p_at) / 600))::bigint::text;
$$;

revoke all on function private.chat_bucket(timestamptz) from public;
grant execute on function private.chat_bucket(timestamptz) to postgres, service_role;

-- ===========================================================================
-- 1) Message 1-à-1 → destinataire
-- ===========================================================================

create or replace function private.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_dest        uuid;
  v_sender      uuid;
  v_sender_name text;
  v_sender_role text;
  v_titre       text;
begin
  -- Les colonnes app peuvent être nulles si l'écriture est passée par les
  -- colonnes legacy : on retombe dessus.
  v_sender := coalesce(new.sender_id, new.from_user_id);
  v_dest   := coalesce(new.recipient_id, new.to_user_id);

  if v_dest is null or v_sender is null or v_dest = v_sender then
    return new;
  end if;

  select coalesce(
           nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
           'مستخدم'
         ),
         p.role
  into v_sender_name, v_sender_role
  from public.profiles p
  where p.id = v_sender;

  v_sender_name := coalesce(v_sender_name, 'مستخدم');

  -- Titre contextualisé par le rôle de l'expéditeur : le destinataire sait
  -- s'il s'agit de son superviseur, d'un membre ou de l'administration.
  v_titre := case v_sender_role
               when 'supervisor' then 'رسالة من المشرف'
               when 'admin'      then 'رسالة من الإدارة'
               else                   'رسالة جديدة'
             end;

  begin
    insert into public.notifications (
      user_id, category, event_type, title, body,
      payload, source_table, source_id
    )
    values (
      v_dest,
      'chat',
      'chat_message',
      v_titre,
      format('لديك رسالة جديدة من %s.', v_sender_name),
      jsonb_build_object(
        'screen', 'ChatConversation',
        'params', jsonb_build_object(
          'contactId', v_sender,
          'contactName', v_sender_name,
          'contactRole', v_sender_role,
          'seanceId', new.seance_id
        ),
        'contactId', v_sender,
        'seanceId', new.seance_id,
        'event_type', 'chat_message'
      ),
      'messages',
      v_sender::text || ':' || v_dest::text || ':'
        || private.chat_bucket(coalesce(new.created_at, now()))
    );
  exception
    -- Attendu et fréquent : c'est le collapse qui s'applique.
    when unique_violation then null;
    when others then
      raise notice 'notify_chat_message: %', SQLERRM;
  end;

  return new;
end;
$$;

drop trigger if exists notify_messages_chat on public.messages;
create trigger notify_messages_chat
  after insert on public.messages
  for each row
  execute function private.notify_chat_message();

revoke all on function private.notify_chat_message() from public;
grant execute on function private.notify_chat_message() to postgres, service_role;

-- ===========================================================================
-- 2) Message de groupe → membres du groupe, sauf l'expéditeur
--    Un push par destinataire et par bucket, jamais un par message.
--    Avec 8 membres : 8 pushes par tranche de 10 min, pas 8 par message.
-- ===========================================================================

create or replace function private.notify_chat_group_message()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_membre_id   uuid;
  v_sender      uuid := new.sender_id;
  v_sender_name text;
  v_group_name  text;
  v_bucket      text;
begin
  if v_sender is null then
    return new;
  end if;

  v_bucket := private.chat_bucket(coalesce(new.created_at, now()));

  select coalesce(
           nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
           'مستخدم'
         )
  into v_sender_name
  from public.profiles p
  where p.id = v_sender;

  v_sender_name := coalesce(v_sender_name, 'مستخدم');

  select coalesce(nullif(trim(g.nom), ''), 'المجموعة')
  into v_group_name
  from public.chat_groups g
  where g.id = new.group_id;

  v_group_name := coalesce(v_group_name, 'المجموعة');

  for v_membre_id in
    select m.membre_id
    from public.chat_group_members m
    where m.group_id = new.group_id
      and m.membre_id is distinct from v_sender
  loop
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        v_membre_id,
        'chat',
        'chat_group_message',
        format('رسائل جديدة في «%s»', v_group_name),
        format('كتب %s في «%s».', v_sender_name, v_group_name),
        jsonb_build_object(
          'screen', 'GroupChat',
          'params', jsonb_build_object(
            'groupId', new.group_id,
            'groupName', v_group_name
          ),
          'groupId', new.group_id,
          'event_type', 'chat_group_message'
        ),
        'chat_group_messages',
        new.group_id::text || ':' || v_bucket
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_chat_group_message (%): %', v_membre_id, SQLERRM;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_chat_group_messages on public.chat_group_messages;
create trigger notify_chat_group_messages
  after insert on public.chat_group_messages
  for each row
  execute function private.notify_chat_group_message();

revoke all on function private.notify_chat_group_message() from public;
grant execute on function private.notify_chat_group_message() to postgres, service_role;

-- ===========================================================================
-- Vérifications post-collage
-- ===========================================================================
--
-- select tgname, pg_get_triggerdef(oid, true)
-- from pg_trigger
-- where tgrelid in ('public.messages'::regclass,
--                   'public.chat_group_messages'::regclass)
--   and not tgisinternal
-- order by tgrelid::regclass::text, tgname;
--
-- select category, event_type, count(*)
-- from public.notifications group by 1, 2 order by 1, 2;
--
-- ---------------------------------------------------------------------------
-- Plan de test
-- ---------------------------------------------------------------------------
-- 1) begin; 12 INSERT messages du même expéditeur vers le même destinataire
--    en quelques secondes → UNE seule notification. rollback;
--    (reproduit le burst réel du 13/09)
-- 2) Deux expéditeurs différents vers le même destinataire, même minute
--    → deux notifications (source_id distincts).
-- 3) Broadcast superviseur (sendBroadcastToMembers, N INSERT 1-à-1)
--    → une notification par destinataire, pas N pour un seul.
-- 4) begin; INSERT chat_group_messages dans un groupe de 8 membres
--    → 7 notifications (tous sauf l'expéditeur). Un second message
--    dans la même tranche de 10 min → 0 de plus. rollback;
-- 5) Message avec seance_id null (admin <-> superviseur)
--    → notification émise, params.seanceId null, ChatConversation l'accepte.
-- 6) Après 0083 : tenter un INSERT admin -> membre
--    → refusé par RLS, donc aucune notification. C'est l'ordre de collage
--      qui garantit ce point.
-- ===========================================================================