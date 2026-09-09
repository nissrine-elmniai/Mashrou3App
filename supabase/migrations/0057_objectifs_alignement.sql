-- MIGRATION 0057 — table objectifs + RLS
-- Alignement avec app/lib/objectifsApi.js (UNIQUE membre_id, saison_id).
-- 0058 ajoute updated_at ; 0059 ajoute les GRANT authenticated.

create table if not exists public.objectifs (
  membre_id uuid not null references auth.users (id) on delete cascade,
  saison_id text not null,
  nb_hizb_cible integer not null
    check (nb_hizb_cible >= 1 and nb_hizb_cible <= 60),
  created_at timestamptz not null default now(),
  primary key (membre_id, saison_id)
);

create index if not exists objectifs_saison_idx
  on public.objectifs (saison_id);

alter table public.objectifs enable row level security;

-- Membre : lecture / écriture de ses propres objectifs
drop policy if exists "objectifs_select_own" on public.objectifs;
create policy "objectifs_select_own"
  on public.objectifs for select
  to authenticated
  using (membre_id = auth.uid());

drop policy if exists "objectifs_insert_own" on public.objectifs;
create policy "objectifs_insert_own"
  on public.objectifs for insert
  to authenticated
  with check (membre_id = auth.uid());

drop policy if exists "objectifs_update_own" on public.objectifs;
create policy "objectifs_update_own"
  on public.objectifs for update
  to authenticated
  using (membre_id = auth.uid())
  with check (membre_id = auth.uid());

drop policy if exists "objectifs_delete_own" on public.objectifs;
create policy "objectifs_delete_own"
  on public.objectifs for delete
  to authenticated
  using (membre_id = auth.uid());

-- Admin : tout
drop policy if exists "objectifs_admin_all" on public.objectifs;
create policy "objectifs_admin_all"
  on public.objectifs for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- Superviseur : lecture des objectifs des membres de ses séances
drop policy if exists "objectifs_select_superviseur" on public.objectifs;
create policy "objectifs_select_superviseur"
  on public.objectifs for select
  to authenticated
  using (
    exists (
      select 1
      from public.inscriptions i
      join public.seances s on s.id = i.seance_id
      where i.membre_id = objectifs.membre_id
        and i.statut = 'accepte'
        and s.superviseur_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
