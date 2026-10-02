-- 0092_test_dates.sql
-- L'admin propose des dates ; le membre n'en choisit qu'une.
-- Le refus efface date_choisie. Un membre ne change plus sa réponse
-- à partir du jour de sa date choisie (fuseau Africa/Casablanca).
-- 0090 et 0091 sont déjà appliquées.

begin;

-- ---------------------------------------------------------------------------
-- Dates proposées pour un test
-- ---------------------------------------------------------------------------

create table if not exists public.test_dates (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests (id) on delete cascade,
  date_proposee date not null,
  created_at timestamptz not null default now(),
  unique (test_id, date_proposee)
);

create index if not exists test_dates_test_id_idx
  on public.test_dates (test_id);

-- Dates déjà choisies avant cette table : sans elles la FK composite échoue.
insert into public.test_dates (test_id, date_proposee)
select distinct test_id, date_choisie
from public.test_invitations
where date_choisie is not null
on conflict (test_id, date_proposee) do nothing;

-- MATCH SIMPLE : la FK n'est pas vérifiée quand date_choisie est null.
alter table public.test_invitations
  drop constraint if exists test_invitations_date_choisie_fkey;

alter table public.test_invitations
  add constraint test_invitations_date_choisie_fkey
  foreign key (test_id, date_choisie)
  references public.test_dates (test_id, date_proposee)
  on delete no action;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.test_dates enable row level security;

drop policy if exists "test_dates_admin_all" on public.test_dates;
create policy "test_dates_admin_all"
  on public.test_dates
  for all
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "test_dates_select_member" on public.test_dates;
create policy "test_dates_select_member"
  on public.test_dates
  for select
  using (private.member_invited_test(test_id));

drop policy if exists "test_dates_select_superviseur" on public.test_dates;
create policy "test_dates_select_superviseur"
  on public.test_dates
  for select
  using (private.supervises_test(test_id));

grant select, insert, update, delete on public.test_dates to authenticated;

-- ---------------------------------------------------------------------------
-- Garde-fou membre. La logique 0090 reste en place ; on y ajoute le délai
-- et l'effacement de la date au refus. Le trigger existant pointe déjà
-- sur cette fonction.
-- ---------------------------------------------------------------------------

create or replace function public.guard_test_invitation_member_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_today date;
begin
  -- Vaut pour l'admin et pour une session sans auth.uid() : on ne note
  -- qu'une invitation déjà confirmée (ou déjà notée, pour corriger la note).
  if new.statut = 'note' and old.statut not in ('confirme', 'note') then
    raise exception 'seule une invitation confirmée peut être notée';
  end if;

  -- Hors session utilisateur (SQL Editor, service_role, edge function) :
  -- auth.uid() est null. Le RLS bloque déjà anon, donc on laisse passer.
  if auth.uid() is null or private.user_has_role('admin') then
    return new;
  end if;

  -- Jour civil à Casablanca : la veille est le dernier jour modifiable.
  v_today := (now() at time zone 'Africa/Casablanca')::date;

  -- Un test terminé ou annulé n'accepte plus de réponse membre.
  if (select t.statut from public.tests t where t.id = new.test_id) is distinct from 'planifie' then
    raise exception 'هذا الاختبار لم يعد مفتوحاً للرد';
  end if;

  if old.date_choisie is not null
     and old.date_choisie <= v_today
     and (
       new.statut is distinct from old.statut
       or new.date_choisie is distinct from old.date_choisie
     )
  then
    raise exception 'لا يمكن تعديل الرد بعد حلول تاريخ الاختبار';
  end if;

  if new.date_choisie is distinct from old.date_choisie
     and new.date_choisie is not null
     and new.date_choisie <= v_today
  then
    raise exception 'يجب اختيار تاريخ لاحق';
  end if;

  if new.statut = 'refuse' then
    new.date_choisie := null;
  end if;

  if new.test_id is distinct from old.test_id
     or new.membre_id is distinct from old.membre_id
     or new.note is distinct from old.note
     or new.date_notification_resultat is distinct from old.date_notification_resultat
  then
    raise exception
      'Un non-admin ne peut pas modifier test_id, membre_id, note ni date_notification_resultat';
  end if;

  if old.statut = 'note' and new.statut is distinct from old.statut then
    raise exception 'Une invitation déjà notée ne peut plus changer de statut';
  end if;

  if new.statut is distinct from old.statut
     and new.statut not in ('confirme', 'refuse') then
    raise exception 'Un non-admin ne peut passer le statut qu''à confirme ou refuse';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Vérification post-migration (à lancer à part) :
--
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'test_dates'
-- order by policyname;
--
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name = 'test_dates'
--   and grantee = 'authenticated'
-- order by privilege_type;
--
-- select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as def
-- from pg_constraint
-- where conrelid in (
--   'public.test_dates'::regclass,
--   'public.test_invitations'::regclass
-- )
--   and conname in (
--     'test_dates_pkey',
--     'test_dates_test_id_date_proposee_key',
--     'test_dates_test_id_fkey',
--     'test_invitations_date_choisie_fkey'
--   )
-- order by table_name, conname;
--
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and tablename = 'test_dates';
