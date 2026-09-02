-- MIGRATION 0040 — table member_programs (programmes de mémorisation)
-- À exécuter après supabase/migrations/0039_saisons_version.sql
--
-- completed_tumuns est la source de vérité ; progress_percentage est dérivé.

create table if not exists public.member_programs (
  id text primary key,
  membre_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  nb_hizb integer not null check (nb_hizb > 0),
  duration_days integer not null check (duration_days > 0),
  start_date text,
  completed_tumuns integer not null default 0 check (completed_tumuns >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_programs_tumuns_max check (completed_tumuns <= nb_hizb * 8)
);

alter table public.member_programs add column if not exists title text;
alter table public.member_programs add column if not exists nb_hizb integer;
alter table public.member_programs add column if not exists duration_days integer;
alter table public.member_programs add column if not exists start_date text;
alter table public.member_programs add column if not exists completed_tumuns integer not null default 0;
alter table public.member_programs add column if not exists created_at timestamptz not null default now();
alter table public.member_programs add column if not exists updated_at timestamptz not null default now();

alter table public.member_programs
  drop column if exists progress_percentage;

alter table public.member_programs
  add column if not exists progress_percentage numeric
  generated always as (
    round((completed_tumuns::numeric / (nb_hizb * 8)) * 100, 2)
  ) stored;

create index if not exists member_programs_membre_idx
  on public.member_programs (membre_id, updated_at desc);

alter table public.member_programs enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.member_programs to authenticated;

-- Membre : CRUD sur ses propres programmes
drop policy if exists "member_programs_crud_own" on public.member_programs;
create policy "member_programs_crud_own"
  on public.member_programs
  for all
  using (membre_id = auth.uid())
  with check (membre_id = auth.uid());

-- Superviseur : lecture des programmes de ses membres
drop policy if exists "member_programs_select_superviseur" on public.member_programs;
create policy "member_programs_select_superviseur"
  on public.member_programs for select
  using (private.supervises_member(member_programs.membre_id));

-- Admin : lecture globale
drop policy if exists "member_programs_select_admin" on public.member_programs;
create policy "member_programs_select_admin"
  on public.member_programs for select
  using (private.is_admin());

notify pgrst, 'reload schema';
