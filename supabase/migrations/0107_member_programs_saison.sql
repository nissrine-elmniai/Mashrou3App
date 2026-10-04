-- 0107_member_programs_saison.sql
-- Un programme appartient à une saison et garde sa propre durée.
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
--
-- Prérequis : public.member_programs est vide (purge de start_new_season).
-- saison_id est NOT NULL, sans DEFAULT et sans remplissage dans le trigger.
-- Une ancienne version de l'app, qui n'envoie pas saison_id, ne peut donc
-- plus réinsérer de programmes après le reset : l'INSERT échoue
-- (NOT NULL, puis le trigger qui ne comble jamais la colonne).

-- 0. Table vide, sinon on refuse avant d'ajouter la colonne NOT NULL.
do $mig$
begin
  if exists (select 1 from public.member_programs) then
    raise exception 'member_programs doit être vide : lancer le reset d''abord';
  end if;
end
$mig$;

-- 1. Lien saison. Pas de valeur par défaut.
alter table public.member_programs
  add column saison_id text not null
  references public.saisons (id) on delete restrict;

-- 2. start_date text → date. Table vide : le cast ne voit aucune ligne.
alter table public.member_programs
  alter column start_date type date
  using start_date::date;

-- 3. Programmes d'un membre dans une saison.
create index member_programs_membre_saison_idx
  on public.member_programs (membre_id, saison_id);

-- 4. duration_days >= 1. 0040 a déjà CHECK (duration_days > 0) sur l'entier :
--    on n'ajoute la contrainte que si aucune n'existe.
do $mig$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'member_programs'
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%duration_days%'
  ) then
    alter table public.member_programs
      add constraint member_programs_duration_days_min
      check (duration_days >= 1);
  end if;
end
$mig$;

-- 5. Saison citée obligatoire et active. Ne modifie jamais saison_id.
--    Aucune contrainte entre member_programs.start_date et saisons.start_date :
--    les inscriptions s'ouvrent avant le début de la saison.
create function private.member_programs_require_active_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
begin
  -- Ancienne version de l'app : elle n'envoie pas saison_id.
  if new.saison_id is null then
    raise exception 'يرجى تحديث التطبيق إلى آخر إصدار';
  end if;

  select z.active
    into v_active
  from public.saisons z
  where z.id = new.saison_id;

  if v_active is not true then
    raise exception 'لا يوجد موسم نشط حالياً';
  end if;

  return new;
end;
$$;

revoke all on function private.member_programs_require_active_season() from public;
revoke all on function private.member_programs_require_active_season() from anon;
revoke all on function private.member_programs_require_active_season() from authenticated;
grant execute on function private.member_programs_require_active_season() to postgres, service_role;

create trigger member_programs_require_active_season
  before insert or update on public.member_programs
  for each row
  execute function private.member_programs_require_active_season();

-- 6. Policies 0040 inchangées (membre = ses lignes, superviseur, admin).
--    Elles ne filtrent pas par saison : l'écriture est refusée par le
--    trigger, la lecture de la saison active se fait côté client.

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Vérifications (SQL Editor, pas par l'app)
-- ---------------------------------------------------------------------------
--
-- A. saison_id text NOT NULL, sans défaut. start_date est date.
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'member_programs'
--   and column_name in ('saison_id', 'start_date', 'duration_days');
-- -- saison_id : text, NO, NULL
-- -- start_date : date
--
-- B. FK vers saisons, ON DELETE RESTRICT.
--
-- select c.conname, pg_get_constraintdef(c.oid)
-- from pg_constraint c
-- join pg_class t on t.oid = c.conrelid
-- join pg_namespace n on n.oid = t.relnamespace
-- where n.nspname = 'public'
--   and t.relname = 'member_programs'
--   and c.contype = 'f';
-- -- FOREIGN KEY (saison_id) REFERENCES saisons(id) ON DELETE RESTRICT
--
-- C. Index (membre_id, saison_id).
--
-- select indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename = 'member_programs'
--   and indexname = 'member_programs_membre_saison_idx';
--
-- D. Trigger BEFORE INSERT OR UPDATE. La fonction ne contient pas
--    d'affectation de saison_id.
--
-- select tgname, pg_get_triggerdef(t.oid)
-- from pg_trigger t
-- join pg_class c on c.oid = t.tgrelid
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname = 'member_programs'
--   and not t.tgisinternal
--   and t.tgname = 'member_programs_require_active_season';
--
-- E. Policies inchangées (3) : crud_own, select_superviseur, select_admin.
--
-- select polname, polcmd
-- from pg_policy p
-- join pg_class c on c.oid = p.polrelid
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname = 'member_programs'
-- order by polname;
--
-- F. CHECK duration_days présent (0040 ou cette migration).
--
-- select c.conname, pg_get_constraintdef(c.oid)
-- from pg_constraint c
-- join pg_class t on t.oid = c.conrelid
-- join pg_namespace n on n.oid = t.relnamespace
-- where n.nspname = 'public'
--   and t.relname = 'member_programs'
--   and c.contype = 'c'
--   and pg_get_constraintdef(c.oid) ilike '%duration_days%';
