-- 0128 : RG6 — interdire admin <-> membre, nettoyer messages_update_read.
-- La fonction live (recollage de 0017/0026) autorisait encore admin <-> membre.
-- On garde profile_has_role (gère roles[]), contrairement à 0083.

create or replace function private.messages_pair_authorized(
  p_sender uuid, p_recipient uuid, p_seance uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_sender is null or p_recipient is null then
    return false;
  end if;

  -- Membre -> son superviseur (séance obligatoire)
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

  -- Superviseur -> membre de sa séance (séance obligatoire)
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

  -- Superviseur <-> admin
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

  -- Admin <-> membre : interdit (RG6). Tout autre cas : refusé.
  return false;
end;
$function$;

-- Lecture : seul le destinataire marque ses messages comme lus.
drop policy if exists messages_update_read on public.messages;
create policy messages_update_read on public.messages
  for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());