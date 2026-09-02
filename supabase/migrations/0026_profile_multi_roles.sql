-- MIGRATION 0026 — même e-mail pour membre ET superviseur (rôles multiples)
-- À exécuter après 0025_supervisor_invitation_public_lookup.sql
--
-- Un compte Auth = un profil avec roles[] (ex. {member, supervisor}).
-- Les fonctions RLS lisent roles[] au lieu du seul champ role.

alter table public.profiles
  add column if not exists roles text[];

update public.profiles
set roles = array[role]::text[]
where roles is null or cardinality(roles) = 0;

alter table public.profiles
  alter column roles set default array['member']::text[],
  alter column roles set not null;

create or replace function private.profile_roles_array(p_role text, p_roles text[])
returns text[]
language sql
immutable
as $$
  select case
    when p_roles is not null and cardinality(p_roles) > 0 then p_roles
    when p_role is not null and trim(p_role) <> '' then array[p_role]
    else array['member']::text[]
  end;
$$;

create or replace function private.profile_has_role(p_profile_id uuid, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles text[];
begin
  if p_profile_id is null or p_role is null then
    return false;
  end if;
  select private.profile_roles_array(p.role, p.roles)
  into v_roles
  from public.profiles p
  where p.id = p_profile_id;
  if v_roles is null then
    return false;
  end if;
  return p_role = any(v_roles);
end;
$$;

create or replace function private.user_has_role(p_role text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select private.profile_has_role(auth.uid(), p_role);
$$;

grant execute on function private.profile_has_role(uuid, text) to authenticated;
grant execute on function private.user_has_role(text) to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select private.user_has_role('admin');
$$;

create or replace function private.is_supervisor()
returns boolean
language sql
security definer
set search_path = public
as $$
  select private.user_has_role('supervisor');
$$;

create or replace function private.is_member()
returns boolean
language sql
security definer
set search_path = public
as $$
  select private.user_has_role('member');
$$;

create or replace function private.alert_targets_me(p_audience text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_audience = 'all' then
    return true;
  end if;
  return (private.user_has_role('member') and p_audience = 'members')
      or (private.user_has_role('supervisor') and p_audience = 'supervisors');
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'member');
  insert into public.profiles (id, email, role, roles, account_status, first_name, last_name)
  values (
    new.id,
    lower(new.email),
    v_role,
    array[v_role]::text[],
    coalesce(new.raw_user_meta_data->>'account_status', 'active'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    roles = (
      select array(
        select distinct unnest(
          private.profile_roles_array(public.profiles.role, public.profiles.roles)
          || private.profile_roles_array(excluded.role, excluded.roles)
        )
      )
    ),
    account_status = excluded.account_status,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    updated_at = now();
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

create or replace function private.messages_pair_authorized(
  p_sender uuid,
  p_recipient uuid,
  p_seance uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sender is null or p_recipient is null then
    return false;
  end if;

  if private.profile_has_role(p_sender, 'member')
     and private.profile_has_role(p_recipient, 'supervisor') then
    return exists (
      select 1
      from public.seances s
      join public.inscriptions i on i.seance_id = s.id
      where i.membre_id = p_sender
        and i.statut = 'accepte'
        and s.superviseur_id = p_recipient
        and s.id = p_seance
    );
  end if;

  if private.profile_has_role(p_sender, 'supervisor')
     and private.profile_has_role(p_recipient, 'member') then
    return exists (
      select 1
      from public.seances s
      join public.inscriptions i on i.seance_id = s.id
      where i.membre_id = p_recipient
        and i.statut = 'accepte'
        and s.superviseur_id = p_sender
        and s.id = p_seance
    );
  end if;

  if (private.profile_has_role(p_sender, 'supervisor')
      and private.profile_has_role(p_recipient, 'admin'))
     or (private.profile_has_role(p_sender, 'admin')
         and private.profile_has_role(p_recipient, 'supervisor')) then
    if p_seance is null then
      return true;
    end if;
    return exists (
      select 1
      from public.seances s
      where s.id = p_seance
        and (s.superviseur_id = p_sender or s.superviseur_id = p_recipient)
    );
  end if;

  if (private.profile_has_role(p_sender, 'member')
      and private.profile_has_role(p_recipient, 'admin'))
     or (private.profile_has_role(p_sender, 'admin')
         and private.profile_has_role(p_recipient, 'member')) then
    if p_seance is null then
      return true;
    end if;
    return exists (
      select 1
      from public.inscriptions i
      where i.statut = 'accepte'
        and i.seance_id = p_seance
        and (i.membre_id = p_sender or i.membre_id = p_recipient)
    );
  end if;

  return false;
end;
$$;

drop trigger if exists on_profile_link_supervisor_invitation on public.profiles;
create trigger on_profile_link_supervisor_invitation
  after insert or update of email, role, roles on public.profiles
  for each row execute function public.link_supervisor_invitation_on_profile();

drop trigger if exists on_profile_link_member_application on public.profiles;
create trigger on_profile_link_member_application
  after insert or update of email, role, roles on public.profiles
  for each row execute function public.link_member_application_on_profile();

notify pgrst, 'reload schema';
