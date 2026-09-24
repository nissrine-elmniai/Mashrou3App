-- MIGRATION 0029 — même e-mail affiché, comptes Auth séparés (membre / superviseur)
-- Le superviseur utilise auth email « local+supervisor@domaine » ; canonical_email
-- sert aux invitations et aux triggers de liaison.

alter table public.profiles
  add column if not exists canonical_email text;

update public.profiles
set canonical_email = lower(
  regexp_replace(trim(email), '\+supervisor(?=@)', '@', 'i')
)
where canonical_email is null or trim(canonical_email) = '';

create or replace function public.profile_canonical_email(p_email text, p_canonical text)
returns text
language sql
immutable
as $$
  select lower(
    coalesce(
      nullif(trim(p_canonical), ''),
      regexp_replace(trim(coalesce(p_email, '')), '\+supervisor(?=@)', '@', 'i')
    )
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_canonical text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'member');
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
    v_role,
    array[v_role]::text[],
    coalesce(new.raw_user_meta_data->>'account_status', 'active'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do update set
    email = excluded.email,
    canonical_email = coalesce(excluded.canonical_email, public.profiles.canonical_email),
    role = excluded.role,
    roles = array[excluded.role]::text[],
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
declare
  v_canonical text;
begin
  if tg_op = 'UPDATE'
     and private.profile_has_role(old.id, 'member')
     and private.profile_has_role(new.id, 'member') then
    return new;
  end if;

  if private.profile_has_role(new.id, 'member') then
    v_canonical := public.profile_canonical_email(new.email, new.canonical_email);
    if v_canonical is null or v_canonical = '' then
      return new;
    end if;

    update public.member_applications
    set
      status = 'activated',
      user_id = new.id,
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
    where lower(email) = v_canonical
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
declare
  v_canonical text;
begin
  if tg_op = 'UPDATE'
     and private.profile_has_role(old.id, 'supervisor')
     and private.profile_has_role(new.id, 'supervisor') then
    return new;
  end if;

  if private.profile_has_role(new.id, 'supervisor') then
    v_canonical := public.profile_canonical_email(new.email, new.canonical_email);
    if v_canonical is null or v_canonical = '' then
      return new;
    end if;

    update public.supervisor_invitations
    set
      status = 'activated',
      updated_at = now()
    where lower(email) = v_canonical
      and status = 'pending';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
