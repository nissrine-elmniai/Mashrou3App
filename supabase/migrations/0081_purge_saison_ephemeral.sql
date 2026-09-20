-- 0081_purge_saison_ephemeral.sql
-- Choix 2 — purge sélective à la désactivation d'une saison.
--
-- SUPPRIME (aucune valeur historique) :
--   chat_groups (+ cascade chat_group_members, chat_group_messages,
--                chat_group_reads — FK ON DELETE CASCADE, 0054:25/38/49)
--   messages 1-à-1 dont seance_id pointe vers une séance de la saison
--     (seance_id null = superviseur <-> admin, 0046 : CONSERVÉ)
--   presence_rappels (job 0034 ; les lignes presences elles-mêmes restent)
--
-- PAS de DELETE sur storage.objects : Supabase lève 42501
-- (storage.protect_delete — utiliser l'API Storage). Les fichiers
-- {group_id}.jpg du bucket chat-group-avatars peuvent rester orphelins ;
-- ils ne sont plus référencés. Nettoyage optionnel : Dashboard → Storage.
--
-- CONSERVE :
--   seances (statut 'archivee'), inscriptions, progression, presences,
--   objectifs, tests, notifications (source_id texte, pas de FK).
--
-- NE PAS EXÉCUTER avant les comptages ci-dessous.
-- Irréversible pour le chat / les DM / les rappels ciblés.
--
-- ---------------------------------------------------------------------------
-- AVANT (lecture seule) — ce qui serait purgé
-- ---------------------------------------------------------------------------
--
-- select
--   (select count(*) from public.chat_groups g
--      join public.seances s on s.id = g.seance_id
--      join public.saisons z on z.id = s.saison_id
--     where z.active = false or s.statut = 'archivee') as chat_groups,
--   (select count(*) from public.chat_group_messages m
--      join public.chat_groups g on g.id = m.group_id
--      join public.seances s on s.id = g.seance_id
--      join public.saisons z on z.id = s.saison_id
--     where z.active = false or s.statut = 'archivee') as chat_messages,
--   (select count(*) from public.messages m
--      join public.seances s on s.id = m.seance_id
--      join public.saisons z on z.id = s.saison_id
--     where z.active = false or s.statut = 'archivee') as dm_seance,
--   (select count(*) from public.presence_rappels r
--      join public.seances s on s.id = r.seance_id
--      join public.saisons z on z.id = s.saison_id
--     where z.active = false or s.statut = 'archivee') as rappels;
--
-- Contrôle « on ne touche pas à l'historique pédagogique » :
-- select
--   (select count(*) from public.progression) as progression,
--   (select count(*) from public.presences) as presences,
--   (select count(*) from public.inscriptions) as inscriptions,
--   (select count(*) from public.objectifs) as objectifs;
--
-- ---------------------------------------------------------------------------
-- APRÈS
-- ---------------------------------------------------------------------------
--
-- Relancer le 1er SELECT : les 4 compteurs doivent être 0.
-- Le 2e SELECT (progression / presences / inscriptions / objectifs) inchangé.
--
-- select proname from pg_proc
-- where pronamespace = 'private'::regnamespace
--   and proname = 'purge_ephemeral_for_seances';

begin;

create or replace function private.purge_ephemeral_for_seances(p_seance_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_seance_ids is null or cardinality(p_seance_ids) = 0 then
    return;
  end if;

  delete from public.messages
  where seance_id = any (p_seance_ids);

  delete from public.presence_rappels
  where seance_id = any (p_seance_ids);

  -- Cascade 0054 : members, messages de groupe, reads.
  delete from public.chat_groups
  where seance_id = any (p_seance_ids);
end;
$$;

revoke all on function private.purge_ephemeral_for_seances(uuid[]) from public;

-- Même trigger 0080 : archiver PUIS purger. Ordre obligatoire — 0054
-- recrée un groupe si statut est encore 'active'.
create or replace function private.saisons_archive_seances_on_deactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  update public.seances
  set statut = 'archivee',
      updated_at = now()
  where saison_id = new.id
    and statut = 'active';

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_ids
  from public.seances
  where saison_id = new.id;

  perform private.purge_ephemeral_for_seances(v_ids);
  return new;
end;
$$;

-- Stock : saisons déjà inactives / séances déjà archivee (0080 n'était pas rétroactif).
update public.seances s
set statut = 'archivee',
    updated_at = now()
from public.saisons z
where z.id = s.saison_id
  and z.active = false
  and s.statut = 'active';

do $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(s.id), '{}'::uuid[])
    into v_ids
  from public.seances s
  join public.saisons z on z.id = s.saison_id
  where z.active = false
     or s.statut = 'archivee';
  perform private.purge_ephemeral_for_seances(v_ids);
end;
$$;

commit;

notify pgrst, 'reload schema';
