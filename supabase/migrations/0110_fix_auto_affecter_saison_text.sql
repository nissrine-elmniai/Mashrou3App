-- 0110_fix_auto_affecter_saison_text.sql
-- Correctif : v_saison_id était déclaré en uuid alors que seances.saison_id est text
-- (ids de saison au format 's_<timestamp>_<n>') → erreur 22P02 qui annulait
-- toute activation d'une demande ayant un seance_id.
create or replace function public.auto_affecter_seance_on_activation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_seance_id uuid;
  v_superviseur_id uuid;
  v_saison_id text;
  v_count int;
begin
  if new.status <> 'activated' or new.user_id is null then
    return new;
  end if;

  -- Cas principal : séance choisie explicitement
  if new.seance_id is not null then
    select id, superviseur_id, saison_id
      into v_seance_id, v_superviseur_id, v_saison_id
    from public.seances
    where id = new.seance_id
      and statut = 'active';

    if v_seance_id is null or v_superviseur_id is null or v_saison_id is null then
      raise notice 'Affectation ignorée pour membre % : séance % inactive, sans superviseur ou sans saison',
        new.user_id, new.seance_id;
    else
      insert into public.inscriptions (seance_id, membre_id, saison_id, statut)
      values (v_seance_id, new.user_id, v_saison_id, 'accepte')
      on conflict (membre_id, saison_id) do nothing;
    end if;
    return new;
  end if;

  -- Repli : une seule séance active pour la saison
  if new.season_id is null then
    return new;
  end if;

  select count(*) into v_count
  from public.seances
  where saison_id = new.season_id and statut = 'active';

  if v_count = 1 then
    select id into v_seance_id
    from public.seances
    where saison_id = new.season_id and statut = 'active'
    limit 1;

    insert into public.inscriptions (seance_id, membre_id, saison_id, statut)
    values (v_seance_id, new.user_id, new.season_id, 'accepte')
    on conflict (membre_id, saison_id) do nothing;
  elsif v_count > 1 then
    raise notice 'Affectation automatique ignorée pour membre % : % séances actives pour la saison %',
      new.user_id, v_count, new.season_id;
  end if;

  return new;
end;
$function$;