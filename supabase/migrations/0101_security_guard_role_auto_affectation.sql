-- 0101_security_guard_role_auto_affectation.sql
-- 1. profiles_guard_role : current_user = propriétaire (SECURITY DEFINER),
--    le garde ne s'appliquait jamais → on se base sur le rôle JWT.
-- 2. auto_affecter_seance_on_activation : ON CONFLICT visait l'index 0003 supprimé (42P10)
--    + séance sans saison → l'insert échouait et annulait l'activation.
--    La cible reprend le prédicat de inscriptions_membre_saison_accepte_unique
--    (membre_id, saison_id) WHERE statut = 'accepte' AND saison_id IS NOT NULL.
--    Sans ce prédicat, Postgres ne reconnaît pas l'index partiel (42P10).
--    seances.saison_id / inscriptions.saison_id sont du texte (0036, 0053).
-- 3. Suppression du trigger en double sur profiles.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

create or replace function private.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Hors requête API (SQL Editor, cron, jobs) ou service_role : non concerné
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if private.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role  := 'member';
    new.roles := array['member']::text[];
    return new;
  end if;

  new.role  := old.role;
  new.roles := old.roles;
  return new;
end;
$function$;

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
      on conflict (membre_id, saison_id)
        where statut = 'accepte' and saison_id is not null
      do nothing;
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
    on conflict (membre_id, saison_id)
      where statut = 'accepte' and saison_id is not null
    do nothing;
  elsif v_count > 1 then
    raise notice 'Affectation automatique ignorée pour membre % : % séances actives pour la saison %',
      new.user_id, v_count, new.season_id;
  end if;

  return new;
end;
$function$;

drop trigger if exists on_profile_member_link on public.profiles;
