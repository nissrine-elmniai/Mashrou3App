-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0008 — policies de LECTURE étendues sur profiles,
-- uniquement ce que les jointures PostgREST du frontend exigent
-- (inscriptions -> profiles(*), seances -> superviseur, messages ->
-- expéditeur/destinataire). À exécuter après supabase/migrations/0007_...
--
-- Ces policies n'ajoutent que du SELECT ciblé. Les policies d'écriture
-- existantes (profiles_insert_own / profiles_update_own) restent limitées à
-- sa propre ligne, et profiles_select_own reste en place.

-- Admin : peut lire tous les profils (gestion complète de l'association).
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

-- Superviseur : peut lire le profil des membres inscrits ('accepte') dans
-- l'une de SES séances. Strictement nécessaire aux jointures
-- inscriptions -> profiles (liste des membres, progression, chat).
-- Un superviseur ne voit donc ni les profils des membres des autres
-- séances, ni ceux des autres superviseurs.
drop policy if exists "profiles_select_superviseur_seance" on public.profiles;
create policy "profiles_select_superviseur_seance"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.inscriptions i
      join public.seances s on s.id = i.seance_id
      where i.membre_id = profiles.id
        and i.statut = 'accepte'
        and s.superviseur_id = auth.uid()
    )
  );

-- Superviseur : peut lire le profil des admins — nécessaire pour résoudre
-- l'identifiant du destinataire (chat superviseur <-> admin) et afficher
-- les noms dans une conversation avec l'administration. N'autorise pas la
-- lecture des profils des autres superviseurs ni des membres d'autres
-- séances.
drop policy if exists "profiles_select_superviseur_admin" on public.profiles;
create policy "profiles_select_superviseur_admin"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'supervisor'
    )
    and role = 'admin'
  );

-- Membre : peut lire le profil du superviseur de SA séance (inscription
-- 'accepte') — nécessaire pour afficher son superviseur dans le chat
-- (jointure seances -> superviseur / profiles). Un membre ne peut pas lire
-- les profils des autres membres, ni celui d'un superviseur d'une autre
-- séance.
drop policy if exists "profiles_select_membre_seance" on public.profiles;
create policy "profiles_select_membre_seance"
  on public.profiles
  for select
  using (
    exists (
      select 1
      from public.seances s
      join public.inscriptions i on i.seance_id = s.id
      where i.membre_id = auth.uid()
        and i.statut = 'accepte'
        and s.superviseur_id = profiles.id
    )
  );
