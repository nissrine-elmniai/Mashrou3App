-- MIGRATION 0026 — RLS profiles UPDATE pour le superviseur
-- À exécuter dans Supabase → SQL Editor après relecture.
--
-- Contexte audit (policies existantes sur profiles) :
--   SELECT : profiles_select_own, profiles_select_admin,
--            profiles_select_superviseur_seance (private.supervises_member),
--            profiles_select_superviseur_admin, profiles_select_membre_seance,
--            profiles_select_membre_admin
--   UPDATE : profiles_update_own uniquement (auth.uid() = id)
--   → aucune policy UPDATE superviseur ; pas de conflit avec admin (pas de policy UPDATE admin).
--
-- Le superviseur peut modifier phone, school, level, hifz_amount des membres
-- inscrits (statut accepte) dans SA séance. La restriction de colonnes est
-- côté application (updateMemberInfo) ; RLS autorise la ligne entière si
-- private.supervises_member(profiles.id) est vrai.

alter table if exists public.profiles enable row level security;

grant update on table public.profiles to authenticated;

drop policy if exists "profiles_update_superviseur" on public.profiles;
create policy "profiles_update_superviseur"
  on public.profiles for update
  using (private.supervises_member(profiles.id))
  with check (private.supervises_member(profiles.id));
