-- MIGRATION 0048 — réponses étendues du formulaire d'intégration
-- Stocke les questions du formulaire (hors champs colonnes existants).

alter table public.member_applications
  add column if not exists form_answers jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
