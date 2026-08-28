-- MIGRATION 0024 — liaison demande membre ↔ séance + affectation auto au superviseur
-- À exécuter après 0023_fix_inscriptions_profiles_fk.sql

alter table public.member_applications
  add column if not exists seance_id uuid references public.seances (id) on delete set null;

alter table public.member_applications
  add column if not exists requested_seance_name text;

alter table public.member_applications
  add column if not exists admin_note text;

create index if not exists member_applications_seance_idx
  on public.member_applications (seance_id);

-- Lecture des séances actives pour le formulaire d'inscription (public)
grant select on table public.seances to anon;

drop policy if exists "seances_select_active_public" on public.seances;
create policy "seances_select_active_public"
  on public.seances for select
  using (statut = 'active');

-- Soumission publique d'une demande en attente (sans compte)
grant insert on table public.member_applications to anon;

drop policy if exists "member_applications_anon_insert_pending" on public.member_applications;
create policy "member_applications_anon_insert_pending"
  on public.member_applications for insert
  with check (status = 'pending');

-- Affectation automatique : priorité à seance_id, repli sur season_id
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
begin
  if new.status <> 'activated' then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  -- Cas principal : séance choisie explicitement par le membre
  if new.seance_id is not null then
    select id, superviseur_id
      into v_seance_id, v_superviseur_id
    from public.seances
    where id = new.seance_id
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
