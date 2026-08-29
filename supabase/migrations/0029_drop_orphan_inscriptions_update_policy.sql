-- MIGRATION 0029 — retrait des policies orphelines superviseur sur inscriptions
-- À exécuter dans Supabase → SQL Editor après relecture.
--
-- superviseur_modifie_ses_inscriptions a été découverte via pg_policies sur la
-- base de production, absente de toute migration versionnée du repo (probablement
-- créée manuellement hors repo ou lors d'un déploiement antérieur). Audit du
-- code applicatif (app/, lib/, scripts/, supabase/functions/) : aucun .update() ni
-- .upsert() superviseur sur public.inscriptions — policy confirmée inutilisée.
-- Elle autorisait un UPDATE sans filtre statut, ce qui aurait laissé un trou de
-- sécurité équivalent à celui corrigé par 0027/0028 si elle n'était pas traitée.
--
-- superviseur_lit_ses_inscriptions est un doublon SELECT identifié dans le même
-- audit : fonctionnellement identique à inscriptions_select_superviseur (0003/0009)
-- qui reste active. On supprime uniquement le doublon, pas la policy versionnée.
--
-- ORDRE D'EXÉCUTION : appliquer après 0027 et 0028.

drop policy if exists "superviseur_modifie_ses_inscriptions" on public.inscriptions;

drop policy if exists "superviseur_lit_ses_inscriptions" on public.inscriptions;

-- État attendu des policies sur public.inscriptions après cette migration :
--   inscriptions_admin_all          — ALL, admin
--   inscriptions_delete_superviseur — DELETE, statut accepte, sa séance (0027)
--   inscriptions_select_own_member  — SELECT, membre
--   inscriptions_select_superviseur — SELECT, superviseur
