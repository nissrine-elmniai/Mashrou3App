-- 0136_tumun_courant_0_7.sql
-- Convention : tumun_courant = nombre de أثمان mémorisés du حزب en cours, 0 à 7.
-- Identique à l'écran et en base. nb_hizb_completes = 60 → tumun_courant = 0.
--
-- AUCUNE CONVERSION DES DONNÉES (décision du 2026-10-13).
-- Le client écrit déjà cette convention :
--   - boutons ± ثمن : (total ÷ 8, total mod 8) (app/lib/progressApi.js,
--     positionFromMemberTumuns) ;
--   - saisie manuelle : 1–7 stockés tels quels, 8 stocké 0 (ancien
--     tumunUiToStored) ;
--   - stats serveur (0123) et client : position = hizb × 8 + tumun_courant.
-- Les lignes issues du ± et de la saisie sont indiscernables : un « − 1 » sur
-- 1–7 retirerait un ثمن à toutes les lignes écrites par le ±. Pour mémoire,
-- la conversion écartée était :
--   -- update public.progression set tumun_courant = tumun_courant - 1
--   -- where tumun_courant between 1 and 7;
--
-- Contrainte remplacée : la contrainte 0–8 sur tumun_courant n'est créée par
-- AUCUN fichier de supabase/migrations/ (la table live précède le dépôt, voir
-- 0041 ; seul 0087 la mentionne en commentaire). Son nom n'est donc pas
-- versionné : le bloc ci-dessous supprime toute contrainte CHECK de
-- public.progression dont la définition cite tumun_courant, et affiche son
-- nom (NOTICE). Requête pour la voir avant d'exécuter :
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.progression'::regclass and contype = 'c';
--
-- Valeurs 8 : jamais converties ici. Si des lignes ont tumun_courant = 8 (ou
-- hors 0–7, ou 60 حزب avec un ثمن ≠ 0), les nouvelles contraintes sont posées
-- NOT VALID : elles s'appliquent aux nouvelles écritures, et la NOTICE donne
-- le nombre de lignes à corriger à la main avant VALIDATE (requêtes en fin
-- de fichier).
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

do $mig$
declare
  c record;
  v_huit integer;
  v_hors integer;
  v_khatm integer;
begin
  select
    count(*) filter (where tumun_courant = 8),
    count(*) filter (where tumun_courant < 0 or tumun_courant > 8),
    count(*) filter (where nb_hizb_completes = 60 and coalesce(tumun_courant, 0) <> 0)
  into v_huit, v_hors, v_khatm
  from public.progression;

  raise notice 'progression : tumun_courant = 8 : % ligne(s) ; hors 0–8 : % ; 60 حزب avec ثمن ≠ 0 : %',
    v_huit, v_hors, v_khatm;

  for c in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.progression'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tumun_courant%'
  loop
    raise notice 'contrainte remplacée : % — %', c.conname, c.def;
    execute format('alter table public.progression drop constraint %I', c.conname);
  end loop;

  alter table public.progression
    add constraint progression_tumun_courant_0_7
    check (tumun_courant is null or tumun_courant between 0 and 7)
    not valid;

  alter table public.progression
    add constraint progression_khatm_tumun_0
    check (nb_hizb_completes is distinct from 60 or coalesce(tumun_courant, 0) = 0)
    not valid;

  if v_huit + v_hors = 0 then
    alter table public.progression validate constraint progression_tumun_courant_0_7;
  else
    raise notice 'progression_tumun_courant_0_7 laissée NOT VALID : % ligne(s) à corriger',
      v_huit + v_hors;
  end if;

  if v_khatm = 0 then
    alter table public.progression validate constraint progression_khatm_tumun_0;
  else
    raise notice 'progression_khatm_tumun_0 laissée NOT VALID : % ligne(s) à corriger', v_khatm;
  end if;
end
$mig$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Vérifications (SQL Editor)
-- ---------------------------------------------------------------------------
--
-- A. Contraintes en place (convalidated = true si validées).
--
-- select conname, convalidated, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.progression'::regclass and contype = 'c';
--
-- B. Lignes bloquant la validation.
--
-- select id, membre_id, saison_id, date, nb_hizb_completes, tumun_courant
-- from public.progression
-- where tumun_courant not between 0 and 7
--    or (nb_hizb_completes = 60 and coalesce(tumun_courant, 0) <> 0)
-- order by membre_id, date;
--
-- C. Après correction manuelle :
--
-- alter table public.progression validate constraint progression_tumun_courant_0_7;
-- alter table public.progression validate constraint progression_khatm_tumun_0;
