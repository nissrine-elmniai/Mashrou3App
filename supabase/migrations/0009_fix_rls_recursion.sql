-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0009 — CORRECTION DE LA RÉCURSION RLS
-- À exécuter après supabase/migrations/0008_profiles_rls_lecture.sql
-- (aucun ordre particulier avec les autres migrations : pas de création de
-- table ici, uniquement des fonctions et des policies recréées via
-- drop policy if exists — idempotente, exécutable seule dans le SQL Editor).
--
-- PROBLÈME :
-- Les policies *_admin_all (seances, inscriptions, progression, tests,
-- test_invitations, test_resultats) vérifient le rôle admin via une
-- sous-requête directe sur profiles, et les policies de 0008 sur profiles
-- interrogent en retour inscriptions/seances. Ces deux sens créent un cycle
-- d'évaluation RLS (profiles -> inscriptions/seances -> policies admin qui
-- reconsultent profiles -> ...), qui explose dès un simple SELECT sur
-- profiles au login :
--   "infinite recursion detected in policy for relation".
-- Deux policies de 0008 (profiles_select_admin, profiles_select_superviseur_admin)
-- sont même auto-référentes : sous-requête sur profiles depuis une policy
-- DE profiles (récursion immédiate, sans passer par inscriptions).
--
-- FIX :
-- Généraliser le pattern security definer déjà utilisé pour le chat en 0006
-- (private.messages_pair_authorized) : toutes les vérifications cross-tables
-- des policies passent par des fonctions du schéma private, qui contournent
-- RLS en interne. Plus AUCUNE policy n'interroge une autre table protégée par
-- RLS via une sous-requête inline.

-- Schéma private (déjà créé en 0006) : non exposé à PostgREST (/rest/v1/).
create schema if not exists private;
-- L'évaluation des policies s'exécute avec les droits du rôle authenticated :
-- il doit pouvoir exécuter les fonctions internes (grant idempotent).
grant usage on schema private to authenticated;

-- ===========================================================================
-- FONCTIONS HELPER security definer
-- ---------------------------------------------------------------------------
-- Même contrat que private.messages_pair_authorized (0006) : language plpgsql,
-- security definer, set search_path = public. Elles sont security definer :
-- leurs requêtes internes s'exécutent avec les droits du propriétaire des
-- tables et ne sont DONC PAS soumises à RLS. C'est indispensable : les
-- policies doivent inspecter le rôle d'UN AUTRE profil et l'affectation d'un
-- membre à une séance, or les policies ordinaires sur profiles/inscriptions/
-- seances ne le permettent pas — c'est précisément ce qui provoquait la
-- récursion (policy -> sous-requête -> policy -> ...).
--
-- Pas de fuite de données : ces fonctions ne font QUE vérifier des relations
-- existantes (rôle de auth.uid(), supervision d'une séance/membre/test,
-- inscription du membre courant). Elles ne renvoient jamais d'identifiants
-- ni de lignes : au pire un appelant peut inférer qu'une paire donnée
-- (lui-même + un identifiant qu'il fournit) est autorisée, information déjà
-- inférable depuis les jointures que les policies autorisent par ailleurs.
-- Le schéma private n'étant pas exposé via /rest/v1/rpc/, seul l'évaluateur
-- RLS (et les procédures SQL) les invoque.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- private.is_admin() — auth.uid() est-il admin ?
-- Remplace : exists (select 1 from profiles where id = auth.uid() and role = 'admin')
-- dans toutes les policies *_admin_all et dans profiles_select_admin.
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.is_supervisor() — auth.uid() est-il superviseur ?
-- Remplace la sous-requête auto-référente de profiles_select_superviseur_admin.
-- ---------------------------------------------------------------------------
create or replace function private.is_supervisor()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'supervisor'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.supervises_member(p_member_id uuid)
-- auth.uid() est-il le superviseur de la séance dans laquelle p_member_id est
-- inscrit avec statut 'accepte' ?
-- Remplace la logique de profiles_select_superviseur_seance ET celle de
-- progression_select_superviseur (celle-ci ne vérifiait pas le statut :
-- comportement aligné sur l'intention documentée 'accepte', identique au
-- reste du schéma).
-- ---------------------------------------------------------------------------
create or replace function private.supervises_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_member_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.inscriptions i
    join public.seances s on s.id = i.seance_id
    where i.membre_id = p_member_id
      and i.statut = 'accepte'
      and s.superviseur_id = auth.uid()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.is_my_supervisor(p_target_id uuid)
-- auth.uid() (membre 'accepte') a-t-il p_target_id pour superviseur ?
-- Variante boolean de member_supervisor_id : ne renvoie AUCUN identifiant,
-- uniquement un verdict — le superviseur éventuel d'une séance n'est
-- récupérable par le membre que via la jointure seances -> profiles déjà
-- autorisée. Remplace la logique de profiles_select_membre_seance.
-- ---------------------------------------------------------------------------
create or replace function private.is_my_supervisor(p_target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_target_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.seances s
    join public.inscriptions i on i.seance_id = s.id
    where i.membre_id = auth.uid()
      and i.statut = 'accepte'
      and s.superviseur_id = p_target_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.supervises_seance(p_seance_id uuid)
-- auth.uid() est-il superviseur de la séance p_seance_id ?
-- Remplace les sous-requêtes vers seances de inscriptions_select_superviseur,
-- inscriptions_write_superviseur, tests_select_superviseur,
-- tests_write_superviseur.
-- ---------------------------------------------------------------------------
create or replace function private.supervises_seance(p_seance_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_seance_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.seances s
    where s.id = p_seance_id
      and s.superviseur_id = auth.uid()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.member_inscrit_seance(p_seance_id uuid)
-- auth.uid() est-il inscrit 'accepte' dans la séance p_seance_id ?
-- Remplace la sous-requête vers inscriptions de seances_select_member_inscrit.
-- ---------------------------------------------------------------------------
create or replace function private.member_inscrit_seance(p_seance_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_seance_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.inscriptions i
    where i.seance_id = p_seance_id
      and i.membre_id = auth.uid()
      and i.statut = 'accepte'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.supervises_test(p_test_id uuid)
-- auth.uid() supervise-t-il la séance du test p_test_id ?
-- Remplace les sous-requêtes vers tests/seances de
-- test_invitations_select_superviseur / test_invitations_write_superviseur.
-- ---------------------------------------------------------------------------
create or replace function private.supervises_test(p_test_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_test_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.tests t
    join public.seances s on s.id = t.seance_id
    where t.id = p_test_id
      and s.superviseur_id = auth.uid()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.member_invited_test(p_test_id uuid)
-- auth.uid() a-t-il une invitation au test p_test_id ?
-- Remplace la sous-requête vers test_invitations de tests_select_member_invited.
-- ---------------------------------------------------------------------------
create or replace function private.member_invited_test(p_test_id uuid)
returns boolean
language plpgsql
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
      and ti.membre_id = auth.uid()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.invitation_of_member(p_invitation_id uuid)
-- auth.uid() est-il le membre de l'invitation p_invitation_id ?
-- Remplace la sous-requête vers test_invitations de
-- test_resultats_select_own_member (lecture de ses propres résultats).
-- ---------------------------------------------------------------------------
create or replace function private.invitation_of_member(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_invitation_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.test_invitations ti
    where ti.id = p_invitation_id
      and ti.membre_id = auth.uid()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- private.supervises_invitation(p_invitation_id uuid)
-- auth.uid() supervise-t-il la séance du test de l'invitation p_invitation_id ?
-- Remplace les sous-requêtes vers test_invitations/tests/seances de
-- test_resultats_select_superviseur / test_resultats_write_superviseur.
-- ---------------------------------------------------------------------------
create or replace function private.supervises_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_invitation_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.test_invitations ti
    join public.tests t on t.id = ti.test_id
    join public.seances s on s.id = t.seance_id
    where ti.id = p_invitation_id
      and s.superviseur_id = auth.uid()
  );
end;
$$;

-- Exécution accordée uniquement au rôle authenticated (évaluation des
-- policies) : anon n'accède à aucune de ces tables, service_role contourne RLS.
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_supervisor() to authenticated;
grant execute on function private.supervises_member(uuid) to authenticated;
grant execute on function private.is_my_supervisor(uuid) to authenticated;
grant execute on function private.supervises_seance(uuid) to authenticated;
grant execute on function private.member_inscrit_seance(uuid) to authenticated;
grant execute on function private.supervises_test(uuid) to authenticated;
grant execute on function private.member_invited_test(uuid) to authenticated;
grant execute on function private.invitation_of_member(uuid) to authenticated;
grant execute on function private.supervises_invitation(uuid) to authenticated;

-- ===========================================================================
-- PROFILES (re-création des policies de 0008)
-- ===========================================================================

-- Admin : peut lire tous les profils.
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles
  for select
  using (private.is_admin());

-- Superviseur : peut lire le profil des membres 'accepte' de SES séances.
drop policy if exists "profiles_select_superviseur_seance" on public.profiles;
create policy "profiles_select_superviseur_seance"
  on public.profiles
  for select
  using (private.supervises_member(profiles.id));

-- Superviseur : peut lire le profil des admins.
drop policy if exists "profiles_select_superviseur_admin" on public.profiles;
create policy "profiles_select_superviseur_admin"
  on public.profiles
  for select
  using (private.is_supervisor() and role = 'admin');

-- Membre : peut lire le profil du superviseur de SA séance.
drop policy if exists "profiles_select_membre_seance" on public.profiles;
create policy "profiles_select_membre_seance"
  on public.profiles
  for select
  using (private.is_my_supervisor(profiles.id));

-- ===========================================================================
-- SEANCES (re-création des policies de 0002)
-- ===========================================================================

-- Admin : tout.
drop policy if exists "seances_admin_all" on public.seances;
create policy "seances_admin_all"
  on public.seances
  for all
  using (private.is_admin())
  with check (private.is_admin());

-- Superviseur : lecture de ses propres séances (inchangée — aucune
-- sous-requête, conservée telle quelle).
-- Membre : lecture seule de la séance où il est inscrit ('accepte').
drop policy if exists "seances_select_member_inscrit" on public.seances;
create policy "seances_select_member_inscrit"
  on public.seances for select
  using (private.member_inscrit_seance(seances.id));

-- ===========================================================================
-- INSCRIPTIONS (re-création des policies de 0003)
-- ===========================================================================

-- Admin : tout.
drop policy if exists "inscriptions_admin_all" on public.inscriptions;
create policy "inscriptions_admin_all"
  on public.inscriptions
  for all
  using (private.is_admin())
  with check (private.is_admin());

-- Superviseur : lecture des inscriptions des séances qui lui appartiennent.
drop policy if exists "inscriptions_select_superviseur" on public.inscriptions;
create policy "inscriptions_select_superviseur"
  on public.inscriptions for select
  using (private.supervises_seance(inscriptions.seance_id));

-- Superviseur : écriture des inscriptions de ses séances.
drop policy if exists "inscriptions_write_superviseur" on public.inscriptions;
create policy "inscriptions_write_superviseur"
  on public.inscriptions
  for all
  using (private.supervises_seance(inscriptions.seance_id))
  with check (private.supervises_seance(inscriptions.seance_id));

-- ===========================================================================
-- PROGRESSION (re-création des policies de 0004)
-- ===========================================================================

-- Admin : lecture globale uniquement.
drop policy if exists "progression_admin_select" on public.progression;
create policy "progression_admin_select"
  on public.progression for select
  using (private.is_admin());

-- Superviseur : lecture des progressions des membres 'accepte' de SES séances.
drop policy if exists "progression_select_superviseur" on public.progression;
create policy "progression_select_superviseur"
  on public.progression for select
  using (private.supervises_member(progression.membre_id));

-- ===========================================================================
-- TESTS (re-création des policies de 0005)
-- ===========================================================================

-- Admin : tout.
drop policy if exists "tests_admin_all" on public.tests;
create policy "tests_admin_all"
  on public.tests
  for all
  using (private.is_admin())
  with check (private.is_admin());

-- Superviseur : lecture des tests des séances qui lui appartiennent.
drop policy if exists "tests_select_superviseur" on public.tests;
create policy "tests_select_superviseur"
  on public.tests for select
  using (private.supervises_seance(tests.seance_id));

-- Superviseur : écriture des tests de ses séances.
drop policy if exists "tests_write_superviseur" on public.tests;
create policy "tests_write_superviseur"
  on public.tests
  for all
  using (private.supervises_seance(tests.seance_id))
  with check (private.supervises_seance(tests.seance_id));

-- Membre : lecture du test auquel il est invité.
drop policy if exists "tests_select_member_invited" on public.tests;
create policy "tests_select_member_invited"
  on public.tests for select
  using (private.member_invited_test(tests.id));

-- ===========================================================================
-- TEST_INVITATIONS (re-création des policies de 0005)
-- ===========================================================================

-- Admin : tout.
drop policy if exists "test_invitations_admin_all" on public.test_invitations;
create policy "test_invitations_admin_all"
  on public.test_invitations
  for all
  using (private.is_admin())
  with check (private.is_admin());

-- Superviseur : lecture des invitations des tests de ses séances.
drop policy if exists "test_invitations_select_superviseur" on public.test_invitations;
create policy "test_invitations_select_superviseur"
  on public.test_invitations for select
  using (private.supervises_test(test_invitations.test_id));

-- Superviseur : écriture des invitations des tests de ses séances.
drop policy if exists "test_invitations_write_superviseur" on public.test_invitations;
create policy "test_invitations_write_superviseur"
  on public.test_invitations
  for all
  using (private.supervises_test(test_invitations.test_id))
  with check (private.supervises_test(test_invitations.test_id));

-- ===========================================================================
-- TEST_RESULTATS (re-création des policies de 0005)
-- ===========================================================================

-- Admin : tout.
drop policy if exists "test_resultats_admin_all" on public.test_resultats;
create policy "test_resultats_admin_all"
  on public.test_resultats
  for all
  using (private.is_admin())
  with check (private.is_admin());

-- Membre : lecture de ses propres résultats (via ses invitations).
drop policy if exists "test_resultats_select_own_member" on public.test_resultats;
create policy "test_resultats_select_own_member"
  on public.test_resultats for select
  using (private.invitation_of_member(test_resultats.test_invitation_id));

-- Superviseur : lecture des résultats des tests de ses séances.
drop policy if exists "test_resultats_select_superviseur" on public.test_resultats;
create policy "test_resultats_select_superviseur"
  on public.test_resultats for select
  using (private.supervises_invitation(test_resultats.test_invitation_id));

-- Superviseur : écriture des résultats des tests de ses séances.
drop policy if exists "test_resultats_write_superviseur" on public.test_resultats;
create policy "test_resultats_write_superviseur"
  on public.test_resultats
  for all
  using (private.supervises_invitation(test_resultats.test_invitation_id))
  with check (private.supervises_invitation(test_resultats.test_invitation_id));

-- ===========================================================================
-- MEMBER_APPLICATIONS (re-création de la policy de 0001)
-- ===========================================================================
-- Même pattern admin -> profiles : remplacé par private.is_admin() pour
-- respecter le principe strict (zéro sous-requête vers une table RLS dans
-- une policy) même si elle ne participe pas au cycle.

-- Admins : lecture / écriture complète.
drop policy if exists "member_applications_admin_all" on public.member_applications;
create policy "member_applications_admin_all"
  on public.member_applications
  for all
  using (private.is_admin())
  with check (private.is_admin());

-- ===========================================================================
-- BILAN DE CONFORMITÉ
-- ---------------------------------------------------------------------------
-- Après cette migration, les seules clauses using/with check contenant une
-- sous-requête existante sont celles qui appellent une fonction private.* :
--   private.is_admin()                        (profil de auth.uid())
--   private.is_supervisor()                   (profil de auth.uid())
--   private.supervises_member(uuid)           (inscriptions -> seances)
--   private.is_my_supervisor(uuid)            (seances -> inscriptions)
--   private.supervises_seance(uuid)           (seances)
--   private.member_inscrit_seance(uuid)       (inscriptions)
--   private.supervises_test(uuid)             (tests -> seances)
--   private.member_invited_test(uuid)         (test_invitations)
--   private.invitation_of_member(uuid)        (test_invitations)
--   private.supervises_invitation(uuid)       (test_invitations -> tests -> seances)
-- Plus AUCUNE policy ne contient de sous-requête existante vers une autre
-- table protégée par RLS : toutes passent par une fonction security definer.
-- Les fonctions, en échappant à RLS (droits du propriétaire), ne déclenchent
-- plus aucune policy — le cycle est cassé.
-- ===========================================================================
