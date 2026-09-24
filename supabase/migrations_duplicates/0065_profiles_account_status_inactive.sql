-- MIGRATION 0065 — account_status 'inactive' + désactivation superviseurs en fin de saison
-- Les comptes restent en base (historique) ; le login est bloqué côté app.

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('invited', 'active', 'inactive'));

create index if not exists profiles_inactive_supervisors_idx
  on public.profiles (account_status)
  where account_status = 'inactive'
    and (
      role = 'supervisor'
      or (roles is not null and 'supervisor' = any (roles))
    );

/**
 * Désactive les superviseurs rattachés aux saisons clôturées (séances de ces saisons).
 * Ne touche pas aux membres ni aux admins.
 * Appel admin uniquement (private.is_admin).
 */
create or replace function public.deactivate_supervisors_for_saisons(p_saison_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_saison_ids is null or cardinality(p_saison_ids) = 0 then
    return 0;
  end if;

  if not private.is_admin() then
    raise exception 'forbidden';
  end if;

  update public.profiles p
  set
    account_status = 'inactive',
    updated_at = now()
  where p.account_status = 'active'
    and (
      p.role = 'supervisor'
      or (p.roles is not null and 'supervisor' = any (p.roles))
    )
    and not (
      p.role = 'admin'
      or (p.roles is not null and 'admin' = any (p.roles))
    )
    and exists (
      select 1
      from public.seances s
      where s.superviseur_id = p.id
        and s.saison_id = any (p_saison_ids)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.deactivate_supervisors_for_saisons(text[]) from public;
grant execute on function public.deactivate_supervisors_for_saisons(text[]) to authenticated;

/**
 * Réactive un profil superviseur (nouvelle saison / nouvelle affectation).
 */
create or replace function public.reactivate_supervisor_profile(p_profile_id uuid)
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
    raise exception 'forbidden';
  end if;

  update public.profiles
  set
    account_status = 'active',
    updated_at = now()
  where id = p_profile_id
    and (
      role = 'supervisor'
      or (roles is not null and 'supervisor' = any (roles))
    )
    and account_status in ('inactive', 'invited', 'active');

  return found;
end;
$$;

revoke all on function public.reactivate_supervisor_profile(uuid) from public;
grant execute on function public.reactivate_supervisor_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
