-- 0083_messages_rg6_et_grants.sql
-- Correctifs de sécurité sur le chat 1-à-1, préalables au lot 4.
--
-- Constat live (audit du 2026-09-23) :
--
-- 1. private.messages_pair_authorized contient encore le « cas 4 »
--    membre <-> admin de 0017, alors que 0046 figure dans schema_migrations.
--    Un recollage de 0017 a écrasé 0046. Pire : quand p_seance est null,
--    le cas 4 retourne true sans condition — et seance_id est facultatif
--    côté client pour les conversations impliquant un admin.
--    RG6 n'est donc fermée que dans l'UI (MemberChatInbox L90,
--    AdminChatScreen L63). Un appel direct à sendMessage la contourne.
--    Aucune ligne admin<->membre en base (0 sur 25) : rien ne sera invalidé.
--
-- 2. GRANT UPDATE sur les 11 colonnes de messages pour authenticated,
--    avec une policy messages_update_read qui ne restreint pas les colonnes.
--    Le destinataire d'un message peut réécrire contenu, body, sender_id.
--    Seul read_at a une raison d'être modifié par le client
--    (markConversationRead, messagesApi.js L341-359).
--
-- Le trigger BEFORE messages_sync_legacy_columns n'est pas affecté :
-- les privilèges de colonne portent sur les colonnes visées par l'ordre SQL,
-- pas sur ce qu'un trigger écrit dans NEW.

-- ---------------------------------------------------------------------------
-- 1) RG6 — suppression du cas 4 (membre <-> admin)
--    Relations autorisées : membre <-> superviseur de SA séance,
--    superviseur <-> admin. Rien d'autre.
-- ---------------------------------------------------------------------------

create or replace function private.messages_pair_authorized(
  p_sender    uuid,
  p_recipient uuid,
  p_seance    uuid
)
returns boolean
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_sender_role    text;
  v_recipient_role text;
begin
  if p_sender is null or p_recipient is null then
    return false;
  end if;

  select role into v_sender_role    from public.profiles where id = p_sender;
  select role into v_recipient_role from public.profiles where id = p_recipient;

  if v_sender_role is null or v_recipient_role is null then
    return false;
  end if;

  -- Cas 1 — membre -> superviseur de SA séance
  if v_sender_role = 'member' and v_recipient_role = 'supervisor' then
    return exists (
      select 1
      from public.seances s
      join public.inscriptions i on i.seance_id = s.id
      where i.membre_id = p_sender
        and i.statut = 'accepte'
        and s.superviseur_id = p_recipient
        and s.id = p_seance
    );
  end if;

  -- Cas 2 — superviseur -> membre inscrit dans SA séance
  if v_sender_role = 'supervisor' and v_recipient_role = 'member' then
    return exists (
      select 1
      from public.seances s
      join public.inscriptions i on i.seance_id = s.id
      where i.membre_id = p_recipient
        and i.statut = 'accepte'
        and s.superviseur_id = p_sender
        and s.id = p_seance
    );
  end if;

  -- Cas 3 — superviseur <-> admin
  if (v_sender_role = 'supervisor' and v_recipient_role = 'admin')
     or (v_sender_role = 'admin' and v_recipient_role = 'supervisor') then
    if p_seance is null then
      return true;
    end if;
    return exists (
      select 1
      from public.seances s
      where s.id = p_seance
        and (s.superviseur_id = p_sender or s.superviseur_id = p_recipient)
    );
  end if;

  -- Cas 4 (membre <-> admin) SUPPRIMÉ — RG6.
  -- Ne pas le réintroduire : il retournait true sans condition quand
  -- p_seance était null.

  return false;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2) UPDATE restreint à read_at
-- ---------------------------------------------------------------------------

revoke update on public.messages from authenticated;
grant  update (read_at) on public.messages to authenticated;

-- ===========================================================================
-- Vérifications post-collage
-- ===========================================================================
--
-- -- Le cas 4 a-t-il disparu ?
-- select pg_get_functiondef(p.oid) from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where p.proname = 'messages_pair_authorized';
--
-- -- Doit renvoyer UNE seule ligne : read_at
-- select column_name from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'messages'
--   and grantee = 'authenticated' and privilege_type = 'UPDATE';
--
-- -- Aucune ligne existante ne doit devenir illisible
-- select count(*) as total,
--        count(*) filter (
--          where private.messages_pair_authorized(sender_id, recipient_id, seance_id)
--        ) as encore_autorisees
-- from public.messages;
-- -- Attendu : 25 / 25
--
-- ---------------------------------------------------------------------------
-- Test applicatif obligatoire après collage
-- ---------------------------------------------------------------------------
-- Ouvrir une conversation en tant que membre et en tant que superviseur :
-- markConversationRead doit continuer à fonctionner. S'il échoue en 42501,
-- c'est qu'il écrit une colonne autre que read_at — vérifier
-- messagesApi.js L341-359 avant de rétablir quoi que ce soit.
-- ===========================================================================