-- Migration 0035 : table push_tokens (générique) + RLS + extension pg_net
-- À exécuter manuellement dans Supabase → SQL Editor.
-- Lot 1/4 notifications push — ne modifie pas check_presence_reminders() (lot 4).

-- ---------------------------------------------------------------------------
-- 1. Table push_tokens
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

-- Contrainte UNIQUE expo_push_token (idempotent)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.push_tokens'::regclass
      and contype = 'u'
      and conname = 'push_tokens_expo_push_token_key'
  ) then
    alter table public.push_tokens
      add constraint push_tokens_expo_push_token_key unique (expo_push_token);
  end if;
exception
  when duplicate_object then null;
  when duplicate_table then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. RLS push_tokens
-- ---------------------------------------------------------------------------

alter table public.push_tokens enable row level security;

grant select, insert, update, delete on table public.push_tokens to authenticated;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
  on public.push_tokens for select
  using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
  on public.push_tokens for insert
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
  on public.push_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
  on public.push_tokens for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Extension pg_net (cohérent avec pg_cron en 0034 : schema extensions)
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;
