-- À coller dans Supabase → SQL Editor, puis Run.
-- FIX alerts : ajoute la colonne message (et le reste) même si la table
-- existait déjà SANS ces colonnes.
--
-- Erreur app :
--   Could not find the 'message' column of 'alerts' in the schema cache

create extension if not exists pgcrypto;
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
end;
$$;
grant execute on function private.is_admin() to authenticated;

-- Table si absente
create table if not exists public.alerts (
  id text primary key,
  message text,
  audience text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- IMPORTANT : si la table existait déjà, CREATE TABLE n'ajoute rien.
-- Ces ALTER sont obligatoires.
alter table public.alerts add column if not exists message text;
alter table public.alerts add column if not exists audience text;
alter table public.alerts add column if not exists created_by uuid;
alter table public.alerts add column if not exists created_at timestamptz default now();

-- Si une ancienne colonne porte le texte, la copier vers message
do $$
declare
  src text;
begin
  foreach src in array array['body','contenu','content','text','msg','description']
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'alerts'
        and column_name = src
    ) then
      execute format(
        'update public.alerts set message = %I where (message is null or message = '''') and %I is not null',
        src, src
      );
    end if;
  end loop;
end $$;

update public.alerts set audience = coalesce(nullif(audience, ''), 'all');

create table if not exists public.alert_acknowledgments (
  alert_id text references public.alerts (id) on delete cascade,
  member_id uuid references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (alert_id, member_id)
);

alter table public.alerts enable row level security;
alter table public.alert_acknowledgments enable row level security;
grant select, insert on table public.alerts to authenticated;
grant select, insert on table public.alert_acknowledgments to authenticated;

create or replace function private.alert_targets_me(p_audience text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_audience = 'all' then
    return true;
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  return (v_role = 'member' and p_audience = 'members')
      or (v_role = 'supervisor' and p_audience = 'supervisors');
end;
$$;

create or replace function private.can_acknowledge_alert(p_alert_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_alert_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.alerts a
    where a.id = p_alert_id
      and private.alert_targets_me(a.audience)
  );
end;
$$;

grant execute on function private.alert_targets_me(text) to authenticated;
grant execute on function private.can_acknowledge_alert(text) to authenticated;

drop policy if exists "alerts_admin_all" on public.alerts;
create policy "alerts_admin_all"
  on public.alerts for all
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "alerts_select_recipients" on public.alerts;
create policy "alerts_select_recipients"
  on public.alerts for select
  using (private.alert_targets_me(audience));

drop policy if exists "alert_acknowledgments_admin_all" on public.alert_acknowledgments;
create policy "alert_acknowledgments_admin_all"
  on public.alert_acknowledgments for all
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "alert_acknowledgments_select_own" on public.alert_acknowledgments;
create policy "alert_acknowledgments_select_own"
  on public.alert_acknowledgments for select
  using (member_id = auth.uid());

drop policy if exists "alert_acknowledgments_insert_own" on public.alert_acknowledgments;
create policy "alert_acknowledgments_insert_own"
  on public.alert_acknowledgments for insert
  with check (
    member_id = auth.uid()
    and private.can_acknowledge_alert(alert_id)
  );

-- Remplit aussi d'éventuelles colonnes legacy NOT NULL (body, etc.)
create or replace function public.alerts_sync_legacy_columns()
returns trigger
language plpgsql
as $$
declare
  payload jsonb := to_jsonb(NEW);
  col text;
begin
  if coalesce(payload->>'message', '') = '' then
    foreach col in array array['body','contenu','content','text','msg']
    loop
      if payload ? col and coalesce(payload->>col, '') <> '' then
        payload := jsonb_set(payload, '{message}', payload->col);
        exit;
      end if;
    end loop;
  end if;

  foreach col in array array['body','contenu','content','text','msg']
  loop
    if payload ? col and coalesce(payload->>col, '') = '' and coalesce(payload->>'message', '') <> '' then
      payload := jsonb_set(payload, array[col], payload->'message');
    end if;
  end loop;

  if coalesce(payload->>'audience', '') = '' then
    payload := jsonb_set(payload, '{audience}', to_jsonb('all'::text));
  end if;

  NEW := jsonb_populate_record(NEW, payload);
  return NEW;
end;
$$;

drop trigger if exists alerts_sync_legacy_columns on public.alerts;
create trigger alerts_sync_legacy_columns
  before insert or update on public.alerts
  for each row
  execute procedure public.alerts_sync_legacy_columns();

create or replace function public.send_alert(p_message text, p_audience text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_id text;
begin
  if not private.is_admin() then
    raise exception 'عملية مخصصة للإدارة فقط';
  end if;
  if p_message is null or trim(p_message) = '' then
    raise exception 'الرسالة فارغة';
  end if;
  if p_audience not in ('all', 'members', 'supervisors') then
    raise exception 'الجمهور المستهدف غير صالح';
  end if;

  select auth.uid() into v_admin_id;
  v_id := gen_random_uuid()::text;

  insert into public.alerts (id, message, audience, created_by, created_at)
  values (v_id, trim(p_message), p_audience, v_admin_id, now());
end;
$$;

grant execute on function public.send_alert(text, text) to authenticated;

do $$
begin
  begin
    execute 'alter table public.alerts replica identity full';
  exception when others then null;
  end;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'alerts'
     ) then
    execute 'alter publication supabase_realtime add table public.alerts';
  end if;
end $$;

-- Force le rechargement du cache API (PostgREST)
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- Résultat attendu : une ligne avec column_name = message
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'alerts'
order by ordinal_position;
