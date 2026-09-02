-- MIGRATION 0036 — saison_id text + heures optionnelles sur seances
-- À exécuter après 0035_saisons.sql

alter table public.seances
  drop constraint if exists seances_saison_id_fkey;

-- Les identifiants de musim côté app sont du texte (ex. s_bootstrap), pas des UUID.
alter table public.seances
  alter column saison_id type text
  using saison_id::text;

alter table public.seances
  alter column heure_debut drop not null;

alter table public.seances
  alter column heure_fin drop not null;

notify pgrst, 'reload schema';
