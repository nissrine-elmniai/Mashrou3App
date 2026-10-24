-- 0138_objectifs_reste_et_programmes_khatm.sql
-- Plafonne nb_hizb_cible au reste du Coran (N = floor((480 − D) / 8)),
-- refuse un objectif si N < 1, et refuse un nouveau programme 'hifz' si la
-- position actuelle du membre est 480 (خاتم).
--
-- Ordre alphabétique des BEFORE sur public.objectifs :
--   objectifs_require_active_enrollment (0109)
--   objectifs_require_position          (0137, INSERT)
--   objectifs_require_reste             (0138, INSERT OR UPDATE OF nb_hizb_cible)
-- « احفظ موضعك أولاً » reste donc le premier message sur INSERT sans départ.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Prérequis : 0135 (season_start_tumun, progression_tumun), 0137.

-- ---------------------------------------------------------------------------
-- a. Objectif : reste du Coran
-- ---------------------------------------------------------------------------

create or replace function private.objectifs_require_reste()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d integer;
  v_max integer;
begin
  -- Ré-écriture sans changement de cible : ne jamais échouer si D a bougé.
  if tg_op = 'UPDATE'
     and new.nb_hizb_cible is not distinct from old.nb_hizb_cible then
    return new;
  end if;

  -- Upsert : le BEFORE INSERT se déclenche aussi pour une ligne existante.
  -- Même cible déjà en base → ne rien bloquer.
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

  if v_d = 480 then
    raise exception
      'أتممت حفظ القرآن، لا يمكن تحديد هدف حفظ. واصل المراجعة';
  end if;

  v_max := (480 - v_d) / 8;

  if v_max < 1 then
    raise exception
      'بقي أقل من حزب لإتمام الحفظ، لا يمكن تحديد هدف بالأحزاب';
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
-- b. Programmes : خاتم → pas de nouveau 'hifz'
-- ---------------------------------------------------------------------------

create or replace function private.member_programs_khatm_mouraja3a()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pos integer;
begin
  -- Ne contrôle que les créations / bascules vers 'hifz'.
  -- Un programme حفظ déjà en base reste modifiable (titre, ثمن, etc.).
  if new.type is distinct from 'hifz' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.type is not distinct from 'hifz' then
    return new;
  end if;

  -- Upsert d'un programme حفظ déjà en base (± ثمن via upsertMemberProgram) :
  -- le BEFORE INSERT se déclenche aussi → ne pas bloquer.
  -- Conflit PostgREST : clé primaire id (pas d'onConflict explicite côté client).
  if tg_op = 'INSERT' and exists (
    select 1 from public.member_programs mp
    where mp.id = new.id and mp.type = 'hifz'
  ) then
    return new;
  end if;

  select private.progression_tumun(p.nb_hizb_completes, p.tumun_courant)::integer
    into v_pos
  from public.progression p
  where p.membre_id = new.membre_id
  order by p.date desc, p.id desc
  limit 1;

  if v_pos = 480 then
    raise exception
      'أتممت حفظ القرآن، يمكنك إضافة برامج المراجعة فقط';
  end if;

  return new;
end;
$$;

revoke all on function private.member_programs_khatm_mouraja3a() from public;
revoke all on function private.member_programs_khatm_mouraja3a() from anon;
revoke all on function private.member_programs_khatm_mouraja3a() from authenticated;

drop trigger if exists member_programs_khatm_mouraja3a on public.member_programs;
create trigger member_programs_khatm_mouraja3a
  before insert or update of type on public.member_programs
  for each row
  execute function private.member_programs_khatm_mouraja3a();

-- ---------------------------------------------------------------------------
-- c. Nettoyage unique : objectifs actifs hors plafond (N < 1 ou cible > N)
-- ---------------------------------------------------------------------------

do $clean$
declare
  v_n integer := 0;
begin
  delete from public.objectifs o
  using public.saisons s
  where s.id = o.saison_id
    and s.active
    and private.season_start_tumun(o.membre_id, o.saison_id) is not null
    and (
      ((480 - private.season_start_tumun(o.membre_id, o.saison_id)) / 8) < 1
      or o.nb_hizb_cible
        > ((480 - private.season_start_tumun(o.membre_id, o.saison_id)) / 8)
    );
  get diagnostics v_n = row_count;
  raise notice '0138 nettoyage objectifs hors plafond : % ligne(s) supprimée(s)', v_n;
end;
$clean$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Vérifications (SQL Editor, après exécution)
-- ---------------------------------------------------------------------------
--
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'public.objectifs'::regclass
--   and not tgisinternal
-- order by tgname;
--
-- select tgname, pg_get_triggerdef(oid)
-- from pg_trigger
-- where tgrelid = 'public.member_programs'::regclass
--   and not tgisinternal
-- order by tgname;
--
-- -- attendu : 0 ligne à hors_plafond = true
-- select o.id,
--        (480 - private.season_start_tumun(o.membre_id, o.saison_id)) / 8 as cible_max,
--        o.nb_hizb_cible
--          > (480 - private.season_start_tumun(o.membre_id, o.saison_id)) / 8
--          as hors_plafond
-- from public.objectifs o
-- join public.saisons s on s.id = o.saison_id and s.active;
