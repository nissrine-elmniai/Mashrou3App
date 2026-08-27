-- DÉPRÉCIÉ pour le fix actuel.
-- Si tu as l'erreur "Could not find the 'message' column",
-- exécute plutôt : 0021_alerts_align_columns.sql
--
-- Ce fichier crée la table alerts si absente + Realtime.
-- Il ne suffit PAS si la table existait déjà sans colonne message.

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
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
end;
$$;
grant execute on function private.is_admin() to authenticated;

create table if not exists public.alerts (
  id text primary key,
  message text not null
    check (char_length(message) between 1 and 500),
  audience text not null
    check (audience in ('all', 'members', 'supervisors')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists alerts_created_at_idx
  on public.alerts (created_at desc);

create index if not exists alerts_audience_idx
  on public.alerts (audience);

create table if not exists public.alert_acknowledgments (
  alert_id text references public.alerts (id) on delete cascade,
  member_id uuid references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (alert_id, member_id)
);

alter table public.alerts enable row level security;
alter table public.alert_acknowledgments enable row level security;

grant usage on schema public to anon, authenticated;
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
  select role into v_role
  from public.profiles
  where id = auth.uid();
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
    select 1
    from public.alerts a
    where a.id = p_alert_id
      and private.alert_targets_me(a.audience)
  );
end;
$$;

grant execute on function private.alert_targets_me(text) to authenticated;
grant execute on function private.can_acknowledge_alert(text) to authenticated;

drop policy if exists "alerts_admin_all" on public.alerts;
create policy "alerts_admin_all"
  on public.alerts
  for all
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "alerts_select_recipients" on public.alerts;
create policy "alerts_select_recipients"
  on public.alerts
  for select
  using (private.alert_targets_me(audience));

drop policy if exists "alert_acknowledgments_admin_all" on public.alert_acknowledgments;
create policy "alert_acknowledgments_admin_all"
  on public.alert_acknowledgments
  for all
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "alert_acknowledgments_select_own" on public.alert_acknowledgments;
create policy "alert_acknowledgments_select_own"
  on public.alert_acknowledgments
  for select
  using (member_id = auth.uid());

drop policy if exists "alert_acknowledgments_insert_own" on public.alert_acknowledgments;
create policy "alert_acknowledgments_insert_own"
  on public.alert_acknowledgments
  for insert
  with check (
    member_id = auth.uid()
    and private.can_acknowledge_alert(alert_id)
  );

create or replace function public.send_alert(p_message text, p_audience text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
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

  insert into public.alerts (id, message, audience, created_by)
  values (gen_random_uuid()::text, trim(p_message), p_audience, v_admin_id);
end;
$$;

grant execute on function public.send_alert(text, text) to authenticated;

-- Realtime : ne doit pas faire échouer le script si la publication diffère
do $$
begin
  begin
    execute 'alter table public.alerts replica identity full';
  exception when others then
    null;
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

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

-- Si tu vois cette ligne dans les résultats, la table existe :
select 'alerts_ok' as status, count(*)::int as rows from public.alerts;
