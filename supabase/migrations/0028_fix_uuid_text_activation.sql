-- MIGRATION 0028 — corriger uuid = text à l'activation (superviseur / membre)
-- À exécuter après 0027_fix_auto_affecter_min_uuid.sql
--
-- Causes :
-- 1) link_*_on_profile relançait l'activation quand on ajoutait un 2e rôle
--    (ex. superviseur sur un compte membre déjà activé) → auto_affecter.
-- 2) auto_affecter comparait seances.id (uuid) à seance_id texte invalide.

-- Normalise seance_id en uuid si la colonne était en texte (bases héritées)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_applications'
      and column_name = 'seance_id'
      and data_type = 'text'
  ) then
    alter table public.member_applications
      alter column seance_id drop default;

    update public.member_applications
    set seance_id = null
    where seance_id is not null
      and seance_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    alter table public.member_applications
      alter column seance_id type uuid using seance_id::uuid;
  end if;
exception
  when others then
    raise notice 'Conversion seance_id -> uuid ignorée : %', sqlerrm;
end;
$$;

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
        new.user_id, v_seance_text;
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

create or replace function public.link_member_application_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ne pas relancer l'activation membre si le rôle membre existait déjà
  -- (ex. ajout du rôle superviseur sur le même compte).
  if tg_op = 'UPDATE'
     and private.profile_has_role(old.id, 'member')
     and private.profile_has_role(new.id, 'member') then
    return new;
  end if;

  if private.profile_has_role(new.id, 'member') and new.email is not null then
    update public.member_applications
    set
      status = 'activated',
      user_id = new.id,
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
    where lower(email) = lower(new.email)
      and status in ('invited', 'pending');
  end if;
  return new;
end;
$$;

create or replace function public.link_supervisor_invitation_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ne pas relancer si le rôle superviseur existait déjà.
  if tg_op = 'UPDATE'
     and private.profile_has_role(old.id, 'supervisor')
     and private.profile_has_role(new.id, 'supervisor') then
    return new;
  end if;

  if private.profile_has_role(new.id, 'supervisor') and new.email is not null then
    update public.supervisor_invitations
    set
      status = 'activated',
      updated_at = now()
    where lower(email) = lower(new.email)
      and status = 'pending';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
