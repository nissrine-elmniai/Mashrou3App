-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0003 — table inscriptions (affectation membre <-> séance)
-- À exécuter après supabase/migrations/0002_seances.sql
--
-- RG3 : un membre = une seule séance active (index unique partiel).
-- RLS : admin = tout ; superviseur = inscriptions de ses séances ;
--       membre = lecture de sa propre ligne uniquement.

create table if not exists public.inscriptions (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid references public.seances (id) on delete cascade,
  membre_id uuid references public.profiles (id) on delete cascade,
  statut text not null default 'accepte'
    check (statut in ('accepte', 'en_attente', 'retire')),
  created_at timestamptz not null default now()
);

-- RG3 : un membre ne peut avoir qu'UNE inscription 'accepte' (une seule
-- séance active). Les autres statuts (en_attente, retire) ne comptent pas.
create unique index if not exists inscriptions_membre_accepte_unique
  on public.inscriptions (membre_id)
  where statut = 'accepte';

create index if not exists inscriptions_seance_idx on public.inscriptions (seance_id);
create index if not exists inscriptions_membre_idx on public.inscriptions (membre_id);

alter table public.inscriptions enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.inscriptions to authenticated;

-- Admin : tout
drop policy if exists "inscriptions_admin_all" on public.inscriptions;
create policy "inscriptions_admin_all"
  on public.inscriptions
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

-- Membre : lecture de sa propre inscription uniquement
drop policy if exists "inscriptions_select_own_member" on public.inscriptions;
create policy "inscriptions_select_own_member"
  on public.inscriptions for select
  using (membre_id = auth.uid());

-- Superviseur : lecture des inscriptions des séances qui lui appartiennent
drop policy if exists "inscriptions_select_superviseur" on public.inscriptions;
create policy "inscriptions_select_superviseur"
  on public.inscriptions for select
  using (
    exists (
      select 1 from public.seances s
      where s.id = inscriptions.seance_id
        and s.superviseur_id = auth.uid()
    )
  );

-- Superviseur : écriture (insert/update/delete) des inscriptions des
-- séances qui lui appartiennent
drop policy if exists "inscriptions_write_superviseur" on public.inscriptions;
create policy "inscriptions_write_superviseur"
  on public.inscriptions
  for all
  using (
    exists (
      select 1 from public.seances s
      where s.id = inscriptions.seance_id
        and s.superviseur_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.seances s
      where s.id = inscriptions.seance_id
        and s.superviseur_id = auth.uid()
    )
  );
