-- 0139_progression_same_day_et_objectif_min.sql
-- C1 : une saisie le même jour (Casablanca) remplace les saisies précédentes du jour.
-- C3 : cible minimum = floor(G / 8) + 1 (au moins 1), via objectifs_require_reste.
--
-- Une saisie le même jour corrige la précédente ; une erreur corrigée un autre
-- jour reste (limite assumée).
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Prérequis : 0135 (season_start_tumun, progression_tumun, member_season_progress),
--             0138 (objectifs_require_reste).
--
-- ---------------------------------------------------------------------------
-- Prévisualisation nettoyage C1 (lancer AVANT d'exécuter cette migration) :
--
-- select p.id, p.membre_id, p.saison_id, p.date, p.nb_hizb_completes, p.tumun_courant,
--        timezone('Africa/Casablanca', p.date)::date as jour_casa,
--        row_number() over (
--          partition by p.membre_id, timezone('Africa/Casablanca', p.date)::date
--          order by p.date desc, p.id desc
--        ) as rn
-- from public.progression p
-- join public.saisons s on s.id = p.saison_id and s.active
-- order by p.membre_id, jour_casa, rn;
-- -- Les lignes avec rn > 1 seront supprimées.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- a. C1 — remplacer les saisies du même jour Casablanca
-- ---------------------------------------------------------------------------

create or replace function private.progression_same_day_replace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Même membre, même saison, même jour Casablanca, date <= new.date, id <> new.id.
  delete from public.progression p
  where p.membre_id = new.membre_id
    and p.id is distinct from new.id
    and p.saison_id is not distinct from new.saison_id
    and p.date <= new.date
    and timezone('Africa/Casablanca', p.date)::date
      = timezone('Africa/Casablanca', new.date)::date;
  return new;
end;
$$;

revoke all on function private.progression_same_day_replace() from public;
revoke all on function private.progression_same_day_replace() from anon;
revoke all on function private.progression_same_day_replace() from authenticated;

drop trigger if exists progression_same_day_replace on public.progression;
create trigger progression_same_day_replace
  after insert on public.progression
  for each row
  execute function private.progression_same_day_replace();

-- ---------------------------------------------------------------------------
-- b. C3 — objectifs_require_reste : minimum floor(G/8)+1
--    (reprend 0138 + garde T11 ; gardes UPDATE / upsert identique inchangées)
-- ---------------------------------------------------------------------------

create or replace function private.objectifs_require_reste()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d integer;
  v_p integer;
  v_max integer;
  v_min integer;
  v_gain integer;
begin
  -- Ré-écriture sans changement de cible : ne jamais échouer si D a bougé.
  if tg_op = 'UPDATE'
     and new.nb_hizb_cible is not distinct from old.nb_hizb_cible then
    return new;
  end if;

  -- Upsert : le BEFORE INSERT se déclenche aussi pour une ligne existante.
  -- Même cible déjà en base → ne rien bloquer (objectif déjà atteint inclus).
  if tg_op = 'INSERT' and exists (
    select 1 from public.objectifs o
    where o.membre_id = new.membre_id
      and o.saison_id = new.saison_id
      and o.nb_hizb_cible = new.nb_hizb_cible
  ) then
    return new;
  end if;

  v_d := private.season_start_tumun(new.membre_id, new.saison_id);
  -- INSERT sans départ : objectifs_require_position a déjà levé (ou lèvera).
  if v_d is null then
    return new;
  end if;

  -- Position actuelle P (même requête que member_programs_khatm_mouraja3a).
  select private.progression_tumun(p.nb_hizb_completes, p.tumun_courant)::integer
    into v_p
  from public.progression p
  where p.membre_id = new.membre_id
  order by p.date desc, p.id desc
  limit 1;

  -- T3 : خاتم au départ (D) ou devenu خاتم en cours de saison (P = 480).
  if v_d = 480 or v_p = 480 then
    raise exception
      'أتممت حفظ القرآن، لا يمكن تحديد هدف حفظ. واصل المراجعة';
  end if;

  v_max := (480 - v_d) / 8;

  v_gain := greatest(0, coalesce(v_p, v_d) - v_d);
  -- Minimum en حزب : floor(G / 8) + 1, au moins 1.
  v_min := greatest(1, v_gain / 8 + 1);

  if v_min > v_max then
    raise exception
      'بقي أقل من حزب لإتمام الحفظ، لا يمكن تحديد هدف بالأحزاب';
  end if;

  if v_max < 1 then
    raise exception
      'بقي أقل من حزب لإتمام الحفظ، لا يمكن تحديد هدف بالأحزاب';
  end if;

  if new.nb_hizb_cible < v_min then
    raise exception
      'الهدف أقل مما حفظته هذا الموسم (الحد الأدنى: %)',
      v_min;
  end if;

  if new.nb_hizb_cible > v_max then
    raise exception
      'الهدف يتجاوز ما تبقى لك من القرآن (الحد الأقصى: %)',
      v_max;
  end if;

  return new;
end;
$$;

revoke all on function private.objectifs_require_reste() from public;
revoke all on function private.objectifs_require_reste() from anon;
revoke all on function private.objectifs_require_reste() from authenticated;

drop trigger if exists objectifs_require_reste on public.objectifs;
create trigger objectifs_require_reste
  before insert or update of nb_hizb_cible on public.objectifs
  for each row
  execute function private.objectifs_require_reste();

-- ---------------------------------------------------------------------------
-- c. Nettoyage unique C1 — saison active, un seul enregistrement / membre / jour
-- ---------------------------------------------------------------------------

do $clean$
declare
  v_n integer := 0;
begin
  delete from public.progression p
  using (
    select ranked.id
    from (
      select
        p2.id,
        row_number() over (
          partition by
            p2.membre_id,
            timezone('Africa/Casablanca', p2.date)::date
          order by p2.date desc, p2.id desc
        ) as rn
      from public.progression p2
      join public.saisons s on s.id = p2.saison_id and s.active
    ) ranked
    where ranked.rn > 1
  ) d
  where p.id = d.id;

  get diagnostics v_n = row_count;
  raise notice '0139 nettoyage progression même jour : % ligne(s) supprimée(s)', v_n;
end;
$clean$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Vérifications (SQL Editor, après exécution)
-- ---------------------------------------------------------------------------
--
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'public.progression'::regclass
--   and not tgisinternal
-- order by tgname;
--
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'public.objectifs'::regclass
--   and not tgisinternal
-- order by tgname;
--
-- -- attendu : 0 doublon (membre, jour Casablanca) dans la saison active
-- select p.membre_id,
--        timezone('Africa/Casablanca', p.date)::date as jour_casa,
--        count(*) as n
-- from public.progression p
-- join public.saisons s on s.id = p.saison_id and s.active
-- group by p.membre_id, timezone('Africa/Casablanca', p.date)::date
-- having count(*) > 1;
--
-- -- attendu : 0 ligne à hors_plafond = true (le nettoyage peut remonter D)
-- select o.id, o.membre_id, o.nb_hizb_cible,
--        (480 - private.season_start_tumun(o.membre_id, o.saison_id)) / 8 as cible_max,
--        o.nb_hizb_cible > (480 - private.season_start_tumun(o.membre_id, o.saison_id)) / 8 as hors_plafond
-- from public.objectifs o
-- join public.saisons s on s.id = o.saison_id and s.active;
