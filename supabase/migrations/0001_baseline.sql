-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0001 — BASELINE : tables profiles + member_applications
-- Regroupe le contenu historique de supabase/profiles.sql et
-- supabase/member_applications.sql (version corrigée : une seule fonction
-- link_member_application_on_profile() et un seul trigger).
-- Les fichiers à la racine de supabase/ sont conservés pour compatibilité.

-- ===========================================================================
-- PROFILES (voir supabase/profiles.sql)
-- ===========================================================================

-- Table profils liée à auth.users (rôles de l'app)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'supervisor', 'member')),
  account_status text not null default 'active'
    check (account_status in ('invited', 'active')),
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));

alter table public.profiles enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.profiles to anon, authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Création auto du profil à l'inscription Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, account_status, first_name, last_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data->>'role', 'member'),
    coalesce(new.raw_user_meta_data->>'account_status', 'active'),
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    account_status = excluded.account_status,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- MEMBER_APPLICATIONS (voir supabase/member_applications.sql — dédoublonné)
-- ===========================================================================

-- Demandes d’inscription membres (stockées à la validation admin)
create table if not exists public.member_applications (
  id text primary key,
  email text not null,
  full_name text,
  first_name text,
  last_name text,
  phone text,
  school text,
  level text,
  hifz_amount text,
  season_id text,
  status text not null default 'pending'
    check (status in ('pending', 'invited', 'activated', 'rejected')),
  user_id uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  activated_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_applications_email_idx
  on public.member_applications (lower(email));

create index if not exists member_applications_status_idx
  on public.member_applications (status);

alter table public.member_applications enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on table public.member_applications to authenticated;

-- Admins : lecture / écriture complète
drop policy if exists "member_applications_admin_all" on public.member_applications;
create policy "member_applications_admin_all"
  on public.member_applications
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Membre : peut lier sa demande à son compte Auth (activation)
drop policy if exists "member_applications_self_update" on public.member_applications;
create policy "member_applications_self_update"
  on public.member_applications
  for update
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "member_applications_self_select" on public.member_applications;
create policy "member_applications_self_select"
  on public.member_applications
  for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Quand le compte Auth/profil membre est créé, lier la demande (même sans session)
create or replace function public.link_member_application_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'member' and new.email is not null then
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

drop trigger if exists on_profile_link_member_application on public.profiles;
create trigger on_profile_link_member_application
  after insert or update of email, role on public.profiles
  for each row execute function public.link_member_application_on_profile();
