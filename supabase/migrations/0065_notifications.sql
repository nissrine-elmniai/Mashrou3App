-- 0065_notifications.sql
-- Inbox in-app + file d'envoi push. Une ligne = un destinataire.
-- Insert : service_role / SECURITY DEFINER uniquement.
-- Client authentifié : SELECT + UPDATE(read_at) sur ses propres lignes.
-- Pas de policy FOR ALL (OR permissif — leçon 0045 / inscriptions).

create schema if not exists private;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null
    check (category in (
      'chat',
      'presence',
      'inscriptions',
      'seances',
      'progression',
      'alertes',
      'systeme'
    )),
  event_type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  source_table text,
  source_id text,
  read_at timestamptz,
  push_sent_at timestamptz,
  claimed_at timestamptz,
  dispatch_request_id bigint,
  push_error text,
  push_attempts integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

-- UNIQUE partiel : une même (user, event, source) ne peut pas être enfilée deux fois.
-- Pas de NULLS NOT DISTINCT : sans source, plusieurs lignes du même event_type
-- restent valides (test, système). Chaîne vide = pas de source, hors index.
create unique index if not exists notifications_dedup_idx
  on public.notifications (user_id, event_type, source_id)
  where source_id is not null and btrim(source_id) <> '';

-- File d'envoi : claim SKIP LOCKED + reprise claimed_at > 2 min.
create index if not exists notifications_push_claim_idx
  on public.notifications (created_at)
  where push_sent_at is null;

alter table public.notifications enable row level security;

revoke all on table public.notifications from public, anon, authenticated;
grant select, update (read_at) on table public.notifications to authenticated;
grant all on table public.notifications to postgres, service_role;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_read_own on public.notifications;
create policy notifications_update_read_own
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Interdit au client de modifier autre chose que read_at.
-- service_role / postgres (Edge, cron) peuvent écrire push_sent_at etc.
create or replace function private.notifications_guard_client_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.category is distinct from old.category
     or new.event_type is distinct from old.event_type
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.payload is distinct from old.payload
     or new.source_table is distinct from old.source_table
     or new.source_id is distinct from old.source_id
     or new.push_sent_at is distinct from old.push_sent_at
     or new.claimed_at is distinct from old.claimed_at
     or new.dispatch_request_id is distinct from old.dispatch_request_id
     or new.push_error is distinct from old.push_error
     or new.push_attempts is distinct from old.push_attempts
     or new.created_at is distinct from old.created_at then
    raise exception 'notifications: seul read_at est modifiable';
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_guard_client_update on public.notifications;
create trigger notifications_guard_client_update
  before update on public.notifications
  for each row
  execute function private.notifications_guard_client_update();

alter table public.notifications replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

notify pgrst, 'reload schema';
