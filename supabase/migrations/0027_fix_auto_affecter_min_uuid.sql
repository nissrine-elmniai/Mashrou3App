-- MIGRATION 0027 — corriger min(uuid) dans auto_affecter_seance_on_activation
-- PostgreSQL n'a pas min() pour le type uuid → erreur à l'activation membre/superviseur.
-- À exécuter après 0026_profile_multi_roles.sql

create or replace function public.auto_affecter_seance_on_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seance_id uuid;
  v_superviseur_id uuid;
  v_count int;
  v_seance_text text;
begin
  if new.status <> 'activated' then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  v_seance_text := nullif(trim(new.seance_id::text), '');

  if v_seance_text is not null then
    if v_seance_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise notice
        'Affectation ignorée pour membre % : seance_id non-uuid (%)',
        new.user_id, v_seance_text;
      return new;
    end if;

    select id, superviseur_id
      into v_seance_id, v_superviseur_id
    from public.seances
    where id = v_seance_text::uuid
      and statut = 'active';

    if v_seance_id is not null and v_superviseur_id is not null then
      insert into public.inscriptions (seance_id, membre_id, statut)
      values (v_seance_id, new.user_id, 'accepte')
      on conflict (membre_id) where statut = 'accepte' do nothing;
    else
      raise notice
        'Affectation ignorée pour membre % : séance % inactive ou sans superviseur',
        new.user_id, new.seance_id;
    end if;

    return new;
  end if;

  -- Repli historique : matching par saison
  if new.season_id is null then
    return new;
  end if;

  select count(*) into v_count
  from public.seances
  where saison_id = new.season_id
    and statut = 'active';

  if v_count = 1 then
    select id into v_seance_id
    from public.seances
    where saison_id = new.season_id
      and statut = 'active'
    limit 1;

    if v_seance_id is not null then
      insert into public.inscriptions (seance_id, membre_id, statut)
      values (v_seance_id, new.user_id, 'accepte')
      on conflict (membre_id) where statut = 'accepte' do nothing;
    end if;
  elsif v_count > 1 then
    raise notice
      'Affectation automatique ignorée pour membre % : % séances actives pour la saison %',
      new.user_id, v_count, new.season_id;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
