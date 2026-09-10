-- 0062_objectifs_depart.sql
-- L'objectif de saison est un INCRÉMENT (« mémoriser N hizb cette saison »),
-- pas une cible absolue. Il faut donc mémoriser la position du membre au
-- moment où il fixe son objectif, pour calculer l'avancement de la saison.
alter table public.objectifs
  add column nb_hizb_depart smallint not null default 0
  check (nb_hizb_depart between 0 and 60);