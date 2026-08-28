-- MIGRATION 0024 — RLS presences : superviseur lit les présences de sa séance
-- À exécuter dans Supabase → SQL Editor si la fiche membre affiche
-- « لا صلاحية كافية لهذه العملية » sur الحضور.

alter table if exists public.presences enable row level security;

grant select on table public.presences to authenticated;

-- Superviseur : membres inscrits (accepte) dans l'une de SES séances
drop policy if exists "presences_select_superviseur" on public.presences;
create policy "presences_select_superviseur"
  on public.presences for select
  using (
    exists (
      select 1
      from public.inscriptions i
      join public.seances s on s.id = i.seance_id
      where i.membre_id = presences.membre_id
        and presences.seance_id = i.seance_id
        and i.statut = 'accepte'
        and s.superviseur_id = auth.uid()
    )
  );

-- Membre : ses propres lignes
drop policy if exists "presences_select_own" on public.presences;
create policy "presences_select_own"
  on public.presences for select
  using (membre_id = auth.uid());

-- Admin : lecture globale
drop policy if exists "presences_admin_select" on public.presences;
create policy "presences_admin_select"
  on public.presences for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
