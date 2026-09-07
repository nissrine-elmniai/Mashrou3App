-- MIGRATION 0050 — ne plus faire échouer Auth sur l'affectation séance
--
-- Symptôme : createUser / signUp → "Database error creating new user"
-- Cause : auto_affecter_seance_on_activation utilisait
--   ON CONFLICT (membre_id) WHERE statut = 'accepte'
-- alors que l'index unique 0003 a été remplacé en 0034 par
--   (membre_id, saison_id) WHERE statut = 'accepte' AND saison_id IS NOT NULL
-- → erreur SQL dans le trigger → rollback de auth.users.

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
  v_saison_id text;
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

    select id, superviseur_id, saison_id
      into v_seance_id, v_superviseur_id, v_saison_id
    from public.seances
    where id = v_seance_text::uuid
      and statut = 'active';

    if v_seance_id is not null and v_superviseur_id is not null then
      begin
        insert into public.inscriptions (seance_id, membre_id, statut, saison_id, date_inscription)
        values (v_seance_id, new.user_id, 'accepte', v_saison_id, now());
      exception
        when unique_violation then
          null;
        when others then
          raise notice
            'Affectation ignorée pour membre % (séance %) : %',
            new.user_id, v_seance_id, SQLERRM;
      end;
    else
      raise notice
        'Affectation ignorée pour membre % : séance % inactive ou sans superviseur',
        new.user_id, new.seance_id;
    end if;

    return new;
  end if;

  if new.season_id is null then
    return new;
  end if;

  select count(*) into v_count
  from public.seances
  where saison_id = new.season_id
    and statut = 'active';

  if v_count = 1 then
    select id, saison_id into v_seance_id, v_saison_id
    from public.seances
    where saison_id = new.season_id
      and statut = 'active'
    limit 1;

    if v_seance_id is not null then
      begin
        insert into public.inscriptions (seance_id, membre_id, statut, saison_id, date_inscription)
        values (v_seance_id, new.user_id, 'accepte', v_saison_id, now());
      exception
        when unique_violation then
          null;
        when others then
          raise notice
            'Affectation ignorée pour membre % (saison %) : %',
            new.user_id, new.season_id, SQLERRM;
      end;
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
