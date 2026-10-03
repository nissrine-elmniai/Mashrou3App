-- 0090_tests_align_cdc.sql
-- Aligne tests / invitations sur le CdC.
--
-- Écart live (schéma déjà partiellement aligné via l'UI, hors migrations) :
--   test_invitations.statut est l'enum test_invitation_statut_enum
--     (invite, confirme, refuse, note), défaut 'invite' — pas un text CHECK.
--   La note est sur test_invitations.note (numeric), pas dans test_resultats.
--   date_notification_resultat existe déjà.
--   UNIQUE (test_id, membre_id) existe : test_invitations_test_id_membre_id_key.
--   Pas de created_at ni updated_at, aucun CHECK.
--   test_resultats est vide et est supprimée ici.
--   tests.saison_id existe en uuid NOT NULL sans FK : recréée en text.
--   tests.created_by est NOT NULL en live (0005 le déclare nullable).
--
-- Un test appartient à une saison (saisons.id est text), plus à une séance.
-- L'admin crée, invite, note. Le membre confirme ou refuse et choisit une date.
-- Le superviseur ne fait que lire les tests et les invitations des membres
-- acceptés dans sa séance.
--
-- seances.saison_id est NOT NULL en live mais pas dans migrations/ :
-- hors de ce fichier, ne pas le corriger ici.
--
-- ON DELETE RESTRICT : la purge 0081 ne supprime pas les saisons ni les tests.
-- CASCADE supprimerait les tests si une saison était un jour effacée.

begin;

-- ---------------------------------------------------------------------------
-- tests : saison text, suppression des colonnes hors CdC
-- ---------------------------------------------------------------------------

-- tests.saison_id existe en live en uuid NOT NULL (ajout hors migrations, via l'UI).
-- saisons.id est text : on la recrée en text. Table vide au moment de 0090.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tests'
      and column_name = 'saison_id' and data_type <> 'text'
  ) then
    alter table public.tests drop column saison_id;
  end if;
end;
$$;

alter table public.tests
  add column if not exists saison_id text;

-- La saison du test est celle de sa séance, quand la colonne existe encore.
-- En live, tests.seance_id a déjà été retirée : on ne référence pas la colonne.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tests'
      and column_name = 'seance_id'
  ) then
    execute $upd$
      update public.tests t
      set saison_id = s.saison_id
      from public.seances s
      where t.seance_id = s.id
        and t.saison_id is null
    $upd$;
  end if;
end;
$$;

-- Orphelins (séance absente ou sans saison) : suppression.
-- test_invitations et test_resultats partent par ON DELETE CASCADE (0005).
do $$
declare
  v_deleted int;
begin
  delete from public.tests
  where saison_id is null;
  get diagnostics v_deleted = row_count;
  raise notice 'tests sans saison supprimés : %', v_deleted;
end;
$$;

alter table public.tests
  drop constraint if exists tests_saison_id_fkey;

alter table public.tests
  add constraint tests_saison_id_fkey
  foreign key (saison_id) references public.saisons (id)
  on delete restrict;

alter table public.tests
  alter column saison_id set not null;

create index if not exists tests_saison_id_idx on public.tests (saison_id);

-- Policies et fonctions qui lisent tests.seance_id, avant le DROP COLUMN.
drop policy if exists "tests_select_superviseur" on public.tests;
drop policy if exists "tests_write_superviseur" on public.tests;
drop policy if exists "test_invitations_select_superviseur" on public.test_invitations;
drop policy if exists "test_invitations_write_superviseur" on public.test_invitations;

-- DROP POLICY exige que la table existe, même avec IF EXISTS.
do $$
begin
  if to_regclass('public.test_resultats') is not null then
    execute 'drop policy if exists "test_resultats_select_superviseur" on public.test_resultats';
    execute 'drop policy if exists "test_resultats_write_superviseur" on public.test_resultats';
  end if;
end;
$$;

-- Le test n'a plus de séance : le superviseur le voit s'il supervise
-- au moins un membre invité (inscription accepte dans sa séance).
create or replace function private.supervises_test(p_test_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_test_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.test_invitations ti
    where ti.test_id = p_test_id
      and private.supervises_member(ti.membre_id)
  );
end;
$$;

-- 0009 : cette fonction ne sert qu'aux policies de test_resultats et lit
-- tests.seance_id. On la retire avant de supprimer la colonne.
-- Les policies superviseur qui l'appellent sont déjà droppées ci-dessus.
drop function if exists private.supervises_invitation(uuid);

drop index if exists public.tests_date_test_idx;

alter table public.tests drop column if exists seance_id;
alter table public.tests drop column if exists date_test;
alter table public.tests drop column if exists form_url;

-- ---------------------------------------------------------------------------
-- test_invitations : CHECKs métier. L'enum, la note et l'unicité
-- test_invitations_test_id_membre_id_key existent déjà en live.
-- ---------------------------------------------------------------------------

alter table public.test_invitations
  add column if not exists date_notification_resultat timestamptz;

-- Présente en live (ajout UI). Sans effet si la colonne existe déjà.
alter table public.test_invitations
  add column if not exists note numeric;

-- Confirmer ou être noté sans date choisie n'a pas de sens pour la collecte.
alter table public.test_invitations
  drop constraint if exists test_invitations_date_si_confirme;

alter table public.test_invitations
  add constraint test_invitations_date_si_confirme
  check (
    statut not in ('confirme', 'note')
    or date_choisie is not null
  );

-- Demi-points possibles. Une note n'existe que lorsque le statut est « note ».
alter table public.test_invitations
  drop constraint if exists test_invitations_note_0_20;

alter table public.test_invitations
  add constraint test_invitations_note_0_20
  check (note is null or (note >= 0 and note <= 20));

alter table public.test_invitations
  drop constraint if exists test_invitations_note_si_note;

alter table public.test_invitations
  add constraint test_invitations_note_si_note
  check ((statut = 'note') = (note is not null));

alter table public.test_invitations
  drop constraint if exists test_invitations_notif_si_note;

alter table public.test_invitations
  add constraint test_invitations_notif_si_note
  check (date_notification_resultat is null or statut = 'note');

-- ---------------------------------------------------------------------------
-- test_resultats : conception abandonnée, la note vit sur l'invitation.
-- Les policies partent avec la table. invitation_of_member ne sert plus
-- qu'à test_resultats_select_own_member (0009).
-- ---------------------------------------------------------------------------

drop table if exists public.test_resultats;

drop function if exists private.invitation_of_member(uuid);
drop function if exists private.supervises_invitation(uuid);

-- ---------------------------------------------------------------------------
-- Garde-fou. Le trigger live s'appelle déjà
-- test_invitations_member_update_guard → guard_test_invitation_member_update().
-- Pas de created_at / updated_at sur la table.
-- ---------------------------------------------------------------------------

create or replace function public.guard_test_invitation_member_update()
returns trigger
language plpgsql
set search_path = public
as $$
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

-- Le trigger 0005 pointe déjà sur cette fonction. On le recrée pour
-- garantir qu'il couvre aussi date_notification_resultat.
drop trigger if exists test_invitations_member_update_guard on public.test_invitations;
create trigger test_invitations_member_update_guard
  before update on public.test_invitations
  for each row
  execute function public.guard_test_invitation_member_update();

-- ---------------------------------------------------------------------------
-- RLS superviseur : lecture seule
-- ---------------------------------------------------------------------------

create policy "tests_select_superviseur"
  on public.tests
  for select
  using (private.supervises_test(tests.id));

create policy "test_invitations_select_superviseur"
  on public.test_invitations
  for select
  using (private.supervises_member(test_invitations.membre_id));

-- ---------------------------------------------------------------------------
-- RLS membre : recréées explicitement.
-- tests_select_member_invited (0009, private.member_invited_test) ne lit pas
-- seance_id : elle reste valide.
-- Les policies admin *_admin_all sur tests et test_invitations ne sont pas
-- modifiées.
-- ---------------------------------------------------------------------------

drop policy if exists "test_invitations_select_own_member" on public.test_invitations;
create policy "test_invitations_select_own_member"
  on public.test_invitations
  for select
  using (membre_id = auth.uid());

drop policy if exists "test_invitations_update_own_member" on public.test_invitations;
create policy "test_invitations_update_own_member"
  on public.test_invitations
  for update
  using (membre_id = auth.uid())
  with check (
    membre_id = auth.uid()
    and statut in ('confirme', 'refuse')
  );

notify pgrst, 'reload schema';

commit;

-- Vérification post-migration (à lancer à part) :
--
-- select tablename, policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('tests', 'test_invitations')
-- order by tablename, policyname;
--
-- select to_regclass('public.test_resultats') is null as resultats_supprimee;
--
-- select table_name, column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('tests', 'test_invitations')
-- order by table_name, ordinal_position;
--
-- select conrelid::regclass as table_name, conname, contype, pg_get_constraintdef(oid) as def
-- from pg_constraint
-- where conrelid in (
--   'public.tests'::regclass,
--   'public.test_invitations'::regclass
-- )
-- order by table_name, contype, conname;
