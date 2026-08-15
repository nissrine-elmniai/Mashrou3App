-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0007 — affectation automatique d'un membre à une séance
-- à l'activation de sa demande (member_applications -> inscriptions)
-- À exécuter après supabase/migrations/0006_messages.sql
--
-- LOGIQUE DE MATCHING (documentée) :
-- member_applications.season_id désigne une SAISON, pas une séance précise :
-- plusieurs séances peuvent partager le même saison_id. Règle retenue :
--   1. on cherche les séances actives avec saison_id = new.season_id ;
--   2. exactement 1 séance  -> inscription créée (statut 'accepte') ;
--   3. aucune séance        -> rien (affectation manuelle ultérieure) ;
--   4. plusieurs séances    -> RAISE NOTICE, aucune inscription créée
--      (pas de choix arbitraire — l'affectation se fera manuellement).
-- La contrainte RG3 (index unique partiel inscriptions(membre_id) où
-- statut='accepte', cf. 0003) garantit qu'un membre ne peut être affecté
-- à deux séances ; l'insertion utilise donc on conflict ... do nothing.

create or replace function public.auto_affecter_seance_on_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seance_id uuid;
  v_count int;
begin
  -- Uniquement à l'activation de la demande
  if new.status <> 'activated' then
    return new;
  end if;

  -- Sans compte Auth lié ou sans saison, rien à affecter
  if new.user_id is null or new.season_id is null then
    return new;
  end if;

  -- Matching saison -> séance(s) active(s)
  select count(*), min(id) into v_count, v_seance_id
  from public.seances
  where saison_id = new.season_id
    and statut = 'active';

  -- Cas 2 : une seule séance active -> affectation directe
  if v_count = 1 and v_seance_id is not null then
    insert into public.inscriptions (seance_id, membre_id, statut)
    values (v_seance_id, new.user_id, 'accepte')
    on conflict (membre_id) where statut = 'accepte' do nothing;
  -- Cas 4 : plusieurs séances actives -> pas de choix arbitraire
  elsif v_count > 1 then
    raise notice
      'Affectation automatique ignorée pour membre % : % séances actives pour la saison %',
      new.user_id, v_count, new.season_id;
  end if;

  return new;
end;
$$;

drop trigger if exists member_applications_auto_affectation on public.member_applications;
create trigger member_applications_auto_affectation
  after insert or update of status on public.member_applications
  for each row execute function public.auto_affecter_seance_on_activation();
