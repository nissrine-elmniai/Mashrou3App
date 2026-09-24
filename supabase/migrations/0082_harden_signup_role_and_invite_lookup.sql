-- 0082 — ne plus faire confiance aux métadonnées Auth pour le rôle,
-- et ne plus exposer le nom / le groupe via la RPC publique d'invitation.
--
-- handle_new_user (0029) lisait raw_user_meta_data.role. Le trigger
-- SECURITY DEFINER s'exécute en postgres, donc profiles_guard_role (0071)
-- ne s'applique pas : un signUp({ data: { role: 'admin' } }) créait un admin.
-- Les comptes superviseur / admin restent posés ensuite par service_role
-- (activate-invited-account upsert, SQL Editor, jobs).
--
-- get_pending_supervisor_invitation renvoyait prénom, nom et groupe à anon.
-- On ne conserve que id / email / status (existence d'une invitation).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical text;
begin
  v_canonical := public.profile_canonical_email(
    new.email,
    new.raw_user_meta_data->>'canonical_email'
  );

  insert into public.profiles (
    id, email, canonical_email, role, roles, account_status, first_name, last_name
  )
  values (
    new.id,
    lower(new.email),
    v_canonical,
    'member',
    array['member']::text[],
    'active',
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do update set
    email = excluded.email,
    canonical_email = coalesce(excluded.canonical_email, public.profiles.canonical_email),
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    updated_at = now();
  return new;
end;
$$;

drop function if exists public.get_pending_supervisor_invitation(text);

create function public.get_pending_supervisor_invitation(p_email text)
returns table (
  id text,
  email text,
  status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    i.id,
    i.email,
    i.status
  from public.supervisor_invitations i
  where lower(trim(i.email)) = lower(trim(p_email))
    and i.status = 'pending'
  order by i.created_at desc
  limit 1;
$$;

revoke all on function public.get_pending_supervisor_invitation(text) from public;
grant execute on function public.get_pending_supervisor_invitation(text) to anon, authenticated;

notify pgrst, 'reload schema';
