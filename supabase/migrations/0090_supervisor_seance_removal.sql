-- 0090_supervisor_seance_removal.sql
-- Suppression cohérente superviseur / séance, sans toucher à l'historique.
--
-- Règles :
--   * Une séance non archivée garde un superviseur (colonne NOT NULL).
--   * Une séance archivée conserve superviseur_id (qui était responsable).
--   * Ce lien archivé ne bloque plus une nouvelle affectation : la clé
--     d'unicité porte sur un id généré, NULL dès que statut = archivee.
--   * Plusieurs NULL sont autorisés, donc plusieurs séances archivées
--     du même superviseur dans la même saison restent valides.
--   * La permutation de deux séances actives reste différée au COMMIT.
--   * retire_supervisor_profile désactive le compte (login bloqué) sans
--     effacer le profil ni les séances archivées.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

begin;

alter table public.seances
  add column if not exists superviseur_actif_id uuid
  generated always as (
    case
      when statut = 'archivee'::public.seance_statut_enum then null
      else superviseur_id
    end
  ) stored;

alter table public.seances
  drop constraint if exists seances_saison_id_superviseur_id_key;

alter table public.seances
  drop constraint if exists seances_saison_superviseur_actif_key;

alter table public.seances
  add constraint seances_saison_superviseur_actif_key
  unique (saison_id, superviseur_actif_id)
  deferrable initially deferred;

create or replace function public.assign_or_swap_seance_superviseur(
  p_seance_id uuid,
  p_superviseur_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a_id uuid;
  v_a_saison text;
  v_a_statut public.seance_statut_enum;
  v_a_superviseur uuid;
  v_b_id uuid;
  v_b_nom text;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_REQUIS' using errcode = '42501';
  end if;

  if p_seance_id is null or p_superviseur_id is null then
    raise exception 'PARAMETRE_MANQUANT' using errcode = 'P0001';
  end if;

  set constraints seances_saison_superviseur_actif_key deferred;

  select s.id, s.saison_id, s.statut, s.superviseur_id
    into v_a_id, v_a_saison, v_a_statut, v_a_superviseur
  from public.seances s
  where s.id = p_seance_id;

  if v_a_id is null then
    raise exception 'SEANCE_INTROUVABLE' using errcode = 'P0001';
  end if;

  if v_a_statut = 'archivee'::public.seance_statut_enum then
    raise exception 'SEANCE_ARCHIVEE' using errcode = 'P0001';
  end if;

  if v_a_superviseur is not distinct from p_superviseur_id then
    return jsonb_build_object(
      'action', 'none',
      'other_seance_id', null,
      'other_seance_nom', null
    );
  end if;

  perform 1
  from public.seances s
  where s.id = p_seance_id
     or (
       s.superviseur_id = p_superviseur_id
       and s.statut <> 'archivee'::public.seance_statut_enum
       and s.saison_id = v_a_saison
     )
  order by s.id
  for update;

  select s.id, s.saison_id, s.statut, s.superviseur_id
    into v_a_id, v_a_saison, v_a_statut, v_a_superviseur
  from public.seances s
  where s.id = p_seance_id;

  if v_a_id is null then
    raise exception 'SEANCE_INTROUVABLE' using errcode = 'P0001';
  end if;

  if v_a_statut = 'archivee'::public.seance_statut_enum then
    raise exception 'SEANCE_ARCHIVEE' using errcode = 'P0001';
  end if;

  if v_a_superviseur is not distinct from p_superviseur_id then
    return jsonb_build_object(
      'action', 'none',
      'other_seance_id', null,
      'other_seance_nom', null
    );
  end if;

  select s.id, coalesce(nullif(trim(s.nom), ''), 'الحصة')
    into v_b_id, v_b_nom
  from public.seances s
  where s.superviseur_id = p_superviseur_id
    and s.id <> p_seance_id
    and s.saison_id = v_a_saison
    and s.statut <> 'archivee'::public.seance_statut_enum
  order by s.id
  limit 1;

  if v_b_id is not null then
    update public.seances
    set superviseur_id = p_superviseur_id,
        updated_at = now()
    where id = v_a_id;

    update public.seances
    set superviseur_id = v_a_superviseur,
        updated_at = now()
    where id = v_b_id;

    return jsonb_build_object(
      'action', 'swap',
      'other_seance_id', v_b_id,
      'other_seance_nom', v_b_nom
    );
  end if;

  update public.seances
  set superviseur_id = p_superviseur_id,
      updated_at = now()
  where id = v_a_id;

  return jsonb_build_object(
    'action', 'assign',
    'other_seance_id', null,
    'other_seance_nom', null
  );
end;
$$;

revoke all on function public.assign_or_swap_seance_superviseur(uuid, uuid) from public;
grant execute on function public.assign_or_swap_seance_superviseur(uuid, uuid) to authenticated;

create or replace function public.swap_seance_superviseur_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  if new.superviseur_id is not distinct from old.superviseur_id then
    return new;
  end if;

  if current_setting('mashrou3.seance_supervisor_swap', true) = 'on' then
    return new;
  end if;

  if not private.is_admin() then
    return new;
  end if;

  if new.statut = 'archivee'::public.seance_statut_enum then
    return new;
  end if;

  select s.id
    into v_other
  from public.seances s
  where s.superviseur_id = new.superviseur_id
    and s.id <> new.id
    and s.saison_id is not distinct from new.saison_id
    and s.statut <> 'archivee'::public.seance_statut_enum
  order by s.id
  limit 1
  for update;

  if v_other is null then
    return new;
  end if;

  perform set_config('mashrou3.seance_supervisor_swap', 'on', true);
  set constraints seances_saison_superviseur_actif_key deferred;

  update public.seances
  set superviseur_id = old.superviseur_id,
      updated_at = now()
  where id = v_other;

  return new;
end;
$$;

revoke all on function public.swap_seance_superviseur_before() from public;

-- Retrait du roster courant : le profil et les séances archivées restent.
-- Refus s'il tient encore une séance non archivée, quelle que soit la saison.
create or replace function public.retire_supervisor_profile(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id is null then
    return false;
  end if;

  if not private.is_admin() then
    raise exception 'ADMIN_REQUIS' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.seances s
    where s.superviseur_id = p_profile_id
      and s.statut is distinct from 'archivee'::public.seance_statut_enum
  ) then
    raise exception 'AFFECTATION_ACTIVE' using errcode = 'P0001';
  end if;

  update public.profiles
  set
    account_status = 'inactive',
    updated_at = now()
  where id = p_profile_id
    and (
      role = 'supervisor'
      or (roles is not null and 'supervisor' = any (roles))
    )
    and not (
      role = 'admin'
      or (roles is not null and 'admin' = any (roles))
    );

  return found;
end;
$$;

revoke all on function public.retire_supervisor_profile(uuid) from public;
grant execute on function public.retire_supervisor_profile(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
