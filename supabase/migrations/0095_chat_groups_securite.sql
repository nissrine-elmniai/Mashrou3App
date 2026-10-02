-- 0095 — sécurisation des groupes de chat
--
-- Composition automatique uniquement :
--   superviseur actuel de la séance (role 'admin' dans le groupe)
--   + inscriptions statut = 'accepte' de cette séance.
-- Un profil dont profiles.role = 'admin' n'appartient à aucun groupe.
-- Les écritures de chat_group_members passent par les fonctions
-- SECURITY DEFINER et les triggers, plus par le client.
--
-- Ne pas exécuter automatiquement. À coller dans le SQL Editor.

begin;

-- ---------------------------------------------------------------------------
-- 1. Synchro interne (sans garde d'appelant) + wrapper public
-- ---------------------------------------------------------------------------
-- Appelants SQL de public.ensure_seance_chat_group trouvés sur disque :
--   public.trg_seances_ensure_chat_group          (0054, mis à jour ici)
--   public.trg_inscriptions_sync_chat_group       (0054, mis à jour ici)
--   backfill ponctuel en fin de 0054              (déjà exécuté, pas un appelant vivant)
-- 0064 et 0089 n'appellent pas la fonction. 0089 met à jour
-- seances.superviseur_id, ce qui déclenche seances_ensure_chat_group.
-- Le client (chatGroupsApi.ensureSeanceChatGroup) reste sur le wrapper public.

create or replace function private.ensure_seance_chat_group_internal(p_seance_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seance record;
  v_group_id uuid;
begin
  if p_seance_id is null then
    return null;
  end if;

  select id, nom, superviseur_id, statut
    into v_seance
  from public.seances
  where id = p_seance_id;

  if v_seance.id is null then
    return null;
  end if;

  select id into v_group_id
  from public.chat_groups
  where seance_id = p_seance_id;

  if v_group_id is null then
    -- Pas de groupe historique : on n'en crée un que pour une séance active
    -- qui a déjà un superviseur. Sinon on ne touche à rien.
    if v_seance.statut::text is distinct from 'active'
       or v_seance.superviseur_id is null then
      return null;
    end if;

    insert into public.chat_groups (seance_id, nom)
    values (p_seance_id, coalesce(nullif(trim(v_seance.nom), ''), 'مجموعة الحصة'))
    returning id into v_group_id;
  end if;

  -- Groupe déjà présent : synchro des membres même si la séance n'est plus
  -- active ou n'a plus de superviseur.

  -- Superviseur actuel = admin du groupe.
  -- On n'insère pas un admin plateforme : le trigger BEFORE INSERT
  -- annulerait toute la synchro, et ce profil ne doit pas être membre.
  if v_seance.superviseur_id is not null
     and not exists (
       select 1
       from public.profiles p
       where p.id = v_seance.superviseur_id
         and p.role = 'admin'
     )
  then
    insert into public.chat_group_members (group_id, membre_id, role)
    values (v_group_id, v_seance.superviseur_id, 'admin')
    on conflict (group_id, membre_id) do update
      set role = 'admin';
  end if;

  -- Inscrits acceptés, hors superviseur (déjà traité) et hors admin plateforme.
  insert into public.chat_group_members (group_id, membre_id, role)
  select v_group_id, i.membre_id, 'member'
  from public.inscriptions i
  join public.profiles p on p.id = i.membre_id
  where i.seance_id = p_seance_id
    and i.statut = 'accepte'
    and i.membre_id is not null
    and p.role is distinct from 'admin'
    and (v_seance.superviseur_id is null or i.membre_id <> v_seance.superviseur_id)
  on conflict (group_id, membre_id) do nothing;

  -- Anciens admins et autres lignes en trop : suppression, plus de
  -- rétrogradation en 'member'. IS DISTINCT FROM couvre un superviseur null.
  delete from public.chat_group_members m
  where m.group_id = v_group_id
    and m.membre_id is distinct from v_seance.superviseur_id
    and not exists (
      select 1
      from public.inscriptions i
      where i.membre_id = m.membre_id
        and i.seance_id = p_seance_id
        and i.statut = 'accepte'
    );

  -- Ligne résiduelle d'un admin plateforme (y compris s'il est le
  -- superviseur actuel : le DELETE ci-dessus le conserve).
  delete from public.chat_group_members m
  using public.profiles p
  where m.group_id = v_group_id
    and p.id = m.membre_id
    and p.role = 'admin';

  return v_group_id;
end;
$$;

revoke all on function private.ensure_seance_chat_group_internal(uuid) from public;
revoke all on function private.ensure_seance_chat_group_internal(uuid) from anon;
revoke all on function private.ensure_seance_chat_group_internal(uuid) from authenticated;

create or replace function public.ensure_seance_chat_group(p_seance_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_superviseur uuid;
begin
  if p_seance_id is null then
    return null;
  end if;

  if auth.uid() is null then
    raise exception 'authentification requise pour synchroniser le groupe'
      using errcode = '42501';
  end if;

  select s.superviseur_id
    into v_superviseur
  from public.seances s
  where s.id = p_seance_id;

  if v_superviseur is distinct from auth.uid() and not private.is_admin() then
    raise exception 'seul le superviseur de la séance ou un administrateur peut synchroniser le groupe'
      using errcode = '42501';
  end if;

  return private.ensure_seance_chat_group_internal(p_seance_id);
end;
$$;

revoke all on function public.ensure_seance_chat_group(uuid) from public;
revoke all on function public.ensure_seance_chat_group(uuid) from anon;
revoke all on function public.ensure_seance_chat_group(uuid) from authenticated;
grant execute on function public.ensure_seance_chat_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers : ils appellent la version interne (pas de garde d'appelant)
-- ---------------------------------------------------------------------------

create or replace function public.trg_seances_ensure_chat_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut::text = 'active'
     and (
       new.superviseur_id is not null
       or exists (
         select 1
         from public.chat_groups g
         where g.seance_id = new.id
       )
     )
  then
    perform private.ensure_seance_chat_group_internal(new.id);
  end if;
  -- Le renommage de la séance ne réécrit pas chat_groups.nom.
  return new;
end;
$$;

drop trigger if exists seances_ensure_chat_group on public.seances;
create trigger seances_ensure_chat_group
  after insert or update of superviseur_id, statut
  on public.seances
  for each row
  execute function public.trg_seances_ensure_chat_group();

create or replace function public.trg_inscriptions_sync_chat_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.seance_id is null or new.membre_id is null then
    return new;
  end if;
  -- Recalcul complet du groupe. L'ancienne séance est retirée par
  -- private.inscriptions_unsync_old_chat_group (0064).
  perform private.ensure_seance_chat_group_internal(new.seance_id);
  return new;
end;
$$;

drop trigger if exists inscriptions_sync_chat_group on public.inscriptions;
create trigger inscriptions_sync_chat_group
  after insert or update of statut, seance_id, membre_id
  on public.inscriptions
  for each row
  execute function public.trg_inscriptions_sync_chat_group();

-- ---------------------------------------------------------------------------
-- 5. Interdire l'appartenance d'un admin plateforme
-- ---------------------------------------------------------------------------

create or replace function private.chat_group_members_reject_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select p.role
    into v_role
  from public.profiles p
  where p.id = new.membre_id;

  if v_role = 'admin' then
    raise exception 'un administrateur plateforme ne peut pas appartenir à un groupe de discussion'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.chat_group_members_reject_platform_admin() from public;
revoke all on function private.chat_group_members_reject_platform_admin() from anon;
revoke all on function private.chat_group_members_reject_platform_admin() from authenticated;

drop trigger if exists chat_group_members_reject_platform_admin on public.chat_group_members;
create trigger chat_group_members_reject_platform_admin
  before insert or update of membre_id
  on public.chat_group_members
  for each row
  execute function private.chat_group_members_reject_platform_admin();

-- ---------------------------------------------------------------------------
-- 6. Membre du groupe seulement si la séance est active
-- ---------------------------------------------------------------------------
-- Utilisé uniquement par les policies RLS (aucune autre fonction SQL) :
--   chat_groups_select_member
--   chat_group_members_select
--   chat_group_messages_select
--   chat_group_messages_insert
--   chat_group_reads_insert_own
--   chat_group_reads_update_own (recréée plus bas)
-- is_chat_group_admin et shares_chat_group ne passent pas par cette
-- fonction. Leurs corps restent ceux de 0054_chat_groups.sql ; seul STABLE
-- est ajouté. Le bucket d'avatars et notify_chat_group_message non plus.

create or replace function private.is_chat_group_admin(p_group uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_group is null or auth.uid() is null then
    return false;
  end if;
  return exists (
    select 1
    from public.chat_groups g
    join public.seances s on s.id = g.seance_id
    where g.id = p_group
      and s.superviseur_id = auth.uid()
  );
end;
$$;

create or replace function private.shares_chat_group(p_profile uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_profile is null or auth.uid() is null then
    return false;
  end if;
  return exists (
    select 1
    from public.chat_group_members a
    join public.chat_group_members b on b.group_id = a.group_id
    where a.membre_id = auth.uid()
      and b.membre_id = p_profile
  );
end;
$$;

create or replace function private.is_chat_group_member(p_group uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_group is null or auth.uid() is null then
    return false;
  end if;
  return exists (
    select 1
    from public.chat_group_members m
    join public.chat_groups g on g.id = m.group_id
    join public.seances s on s.id = g.seance_id
    where m.group_id = p_group
      and m.membre_id = auth.uid()
      and s.statut::text = 'active'
  );
end;
$$;

grant execute on function private.is_chat_group_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 et 8. Policies : plus d'écriture directe, plus de lecture admin
-- ---------------------------------------------------------------------------
-- Aucun écran de app/screens/admin ni aucun module admin de app/lib
-- ne lit chat_groups / chat_group_members. Le OR is_admin() est retiré.

drop policy if exists chat_group_members_insert_admin on public.chat_group_members;
drop policy if exists chat_group_members_delete_admin on public.chat_group_members;

revoke insert, delete on table public.chat_group_members from authenticated;
revoke insert, delete on table public.chat_group_members from anon;
revoke insert, delete on table public.chat_group_members from public;

drop policy if exists chat_groups_select_member on public.chat_groups;
create policy chat_groups_select_member
  on public.chat_groups for select
  to authenticated
  using (private.is_chat_group_member(id));

drop policy if exists chat_group_members_select on public.chat_group_members;
create policy chat_group_members_select
  on public.chat_group_members for select
  to authenticated
  using (private.is_chat_group_member(group_id));

-- ---------------------------------------------------------------------------
-- 7. Watermark de lecture : réservé au membre d'un groupe de séance active
-- ---------------------------------------------------------------------------

drop policy if exists chat_group_reads_update_own on public.chat_group_reads;
create policy chat_group_reads_update_own
  on public.chat_group_reads for update
  to authenticated
  using (
    user_id = auth.uid()
    and private.is_chat_group_member(group_id)
  )
  with check (
    user_id = auth.uid()
    and private.is_chat_group_member(group_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Nettoyage des appartenances hors composition automatique
-- ---------------------------------------------------------------------------

do $$
declare
  v_hors_composition int;
  v_admins int;
begin
  delete from public.chat_group_members m
  using public.chat_groups g
  join public.seances s on s.id = g.seance_id
  where g.id = m.group_id
    and m.membre_id is distinct from s.superviseur_id
    and not exists (
      select 1
      from public.inscriptions i
      where i.membre_id = m.membre_id
        and i.seance_id = g.seance_id
        and i.statut = 'accepte'
    );
  get diagnostics v_hors_composition = row_count;

  delete from public.chat_group_members m
  using public.profiles p
  where p.id = m.membre_id
    and p.role = 'admin';
  get diagnostics v_admins = row_count;

  raise notice 'chat_group_members hors superviseur et hors inscription acceptee : % ligne(s) supprimee(s)',
    v_hors_composition;
  raise notice 'chat_group_members admin plateforme : % ligne(s) supprimee(s)',
    v_admins;
end;
$$;

commit;

notify pgrst, 'reload schema';
