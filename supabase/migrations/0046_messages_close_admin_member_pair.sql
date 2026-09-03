-- 0046 — messages : fermeture de la relation admin <-> membre (RG6)
--
-- Le 4e bloc de messages_pair_authorized() autorisait admin <-> membre, en
-- contradiction avec RG6 et le document de conception BDD. Seules deux
-- relations restent valides :
--   - membre <-> son superviseur (seance_id obligatoire)
--   - superviseur <-> admin (seance_id facultatif)
--
-- La fonction est appelée par messages_select_authorized ET
-- messages_insert_authorized : les messages admin <-> membre deviennent donc
-- impossibles a creer ET invisibles. Les 4 lignes existantes (donnees de test,
-- simples salutations) sont supprimees ici pour ne pas laisser de lignes mortes.
--
-- L'UI a deja ete corrigee dans le lot precedent : plus aucun ecran n'offre
-- cette relation.

begin;

-- 1. Purge des messages admin <-> membre (donnees de test)
delete from public.messages m
using public.profiles ps, public.profiles pr
where ps.id = m.sender_id
  and pr.id = m.recipient_id
  and (
    (ps.role = 'admin'  and pr.role = 'member')
    or (ps.role = 'member' and pr.role = 'admin')
  );

-- 2. Redefinition de la fonction sans le bloc admin <-> membre
CREATE OR REPLACE FUNCTION private.messages_pair_authorized(p_sender uuid, p_recipient uuid, p_seance uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_sender is null or p_recipient is null then
    return false;
  end if;

  if private.profile_has_role(p_sender, 'member')
     and private.profile_has_role(p_recipient, 'supervisor') then
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

  if private.profile_has_role(p_sender, 'supervisor')
     and private.profile_has_role(p_recipient, 'member') then
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

  if (private.profile_has_role(p_sender, 'supervisor')
      and private.profile_has_role(p_recipient, 'admin'))
     or (private.profile_has_role(p_sender, 'admin')
         and private.profile_has_role(p_recipient, 'supervisor')) then
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

  -- Toute autre paire (dont admin <-> membre) est refusee.
  return false;
end;
$function$;

commit;
