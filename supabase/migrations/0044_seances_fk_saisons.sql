-- 0044 — FK seances.saison_id -> saisons.id
--
-- Absente jusqu'ici : sans relation déclarée, PostgREST ne peut pas résoudre
-- l'embed `seances(*, saisons(start_date))` et renvoie PGRST200, ce qui vidait
-- silencieusement les dates de saison côté Superviseur.
--
-- Types alignés : seances.saison_id = text (posé par 0036), saisons.id = text.
-- Aucune conversion nécessaire.
--
-- on delete restrict volontaire : supprimer une saison ne doit pas emporter
-- les séances en silence.

alter table public.seances
  drop constraint if exists seances_saison_id_fkey;

alter table public.seances
  add constraint seances_saison_id_fkey
  foreign key (saison_id) references public.saisons(id)
  on delete restrict;
