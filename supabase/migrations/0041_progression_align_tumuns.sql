-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0041 — progression : alignement sur le modèle tumuns
-- À exécuter après supabase/migrations/0040_member_programs.sql
--
-- Contexte : la table public.progression distante est le schéma CdC historique
-- (nb_hizb_completes / tumun_courant / notes / saison_id), pas celui de 0004
-- (juze / tumun / note) — 0004 était un `create table if not exists` sur une
-- table déjà existante. Le code écrit désormais nb_hizb_completes + tumun_courant
-- (dérivés de completed_tumuns) et ne stocke jamais juze.
--
-- Seul blocage restant : saison_id uuid NOT NULL sans défaut. Partout ailleurs
-- dans l'app les identifiants de saison sont du texte sans FK (cf. 0035), et
-- l'écriture doit rester possible sans saison active.

alter table public.progression
  alter column saison_id drop not null;

alter table public.progression
  alter column saison_id type text using saison_id::text;

notify pgrst, 'reload schema';
