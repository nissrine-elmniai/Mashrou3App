-- MIGRATION 0027 — RLS inscriptions DELETE pour le superviseur
-- À exécuter dans Supabase → SQL Editor après relecture.
--
-- Contexte audit (policies existantes sur inscriptions) :
--   SELECT : inscriptions_select_own_member, inscriptions_select_superviseur,
--            inscriptions_admin_all
--   INSERT/UPDATE/DELETE : inscriptions_write_superviseur (FOR ALL via
--            private.supervises_seance — sans filtre statut)
--   → cette policy DELETE explicite documente et restreint le retrait au
--     statut 'accepte' dans SA séance (complément sémantique RG3).
--
-- FK inscriptions (0003 / 0023) :
--   seance_id -> seances ON DELETE CASCADE (supprime inscriptions si séance supprimée)
--   membre_id -> profiles ON DELETE CASCADE (supprime inscriptions si profil supprimé)
--   Aucune FK depuis presences/progression vers inscriptions :
--   DELETE d'une ligne inscriptions ne cascade pas vers présence/progression.
--
-- Action métier : retirer un membre = supprimer la ligne inscriptions
-- (membre_id + seance_id), pas le profil profiles.

alter table if exists public.inscriptions enable row level security;

grant delete on table public.inscriptions to authenticated;

drop policy if exists "inscriptions_delete_superviseur" on public.inscriptions;
create policy "inscriptions_delete_superviseur"
  on public.inscriptions for delete
  using (
    statut = 'accepte'
    and exists (
      select 1
      from public.seances s
      where s.id = inscriptions.seance_id
        and s.superviseur_id = auth.uid()
    )
  );
