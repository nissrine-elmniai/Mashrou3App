-- 0112_auto_affecter_genre.sql
-- Repli d'auto_affecter : ne choisir qu'une séance active du même genre.
-- Part de 0110 (v_saison_id text, on conflict sans WHERE).
-- Le cas « séance choisie explicitement » est inchangé.
-- Le trigger n'est pas recréé.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Un seul script = une transaction.

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
  v_genre text;
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

  -- Repli : une seule séance active pour la saison et le genre
  if new.season_id is null then
    return new;
  end if;

  v_genre := nullif(trim(new.genre), '');
  if v_genre is null then
    select nullif(trim(p.genre), '')
      into v_genre
    from public.profiles p
    where p.id = new.user_id;
  end if;

  -- Genre inconnu : pas d'affectation. La notification « تفعيل بدون حصة »
  -- prévient les admins.
  if v_genre is null then
    raise notice 'Affectation automatique ignorée pour membre % : genre inconnu',
      new.user_id;
    return new;
  end if;

  select count(*) into v_count
  from public.seances
  where saison_id = new.season_id
    and statut = 'active'
    and genre = v_genre;

  if v_count = 1 then
    select id into v_seance_id
    from public.seances
    where saison_id = new.season_id
      and statut = 'active'
      and genre = v_genre
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
