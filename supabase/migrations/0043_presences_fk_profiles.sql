-- 0043 — presences.membre_id : membres(user_id) -> profiles(id)
--
-- Contexte : le FK avait été créé selon le schéma du CdC (users + membres),
-- alors que la décision actée du projet est que `profiles` est la source de
-- vérité pour l'identité. La table `membres` n'est jamais alimentée, donc
-- TOUT marquage de présence échouait avec une erreur 23503.
-- Cohérence : inscriptions.membre_id référence déjà profiles(id).
--
-- Sans risque de perte : public.presences contient 0 ligne à la date de
-- rédaction de cette migration.

alter table public.presences
  drop constraint if exists presences_membre_id_fkey;

alter table public.presences
  add constraint presences_membre_id_fkey
  foreign key (membre_id) references public.profiles(id)
  on delete cascade;
