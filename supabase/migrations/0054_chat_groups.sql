-- 0054 — Groupes de discussion par séance
--
-- Un groupe auto-créé par séance active : le superviseur est admin, tous les
-- membres acceptés y sont ajoutés. Discussion multi-participants indépendante
-- de public.messages (RG6 1-à-1 inchangé).

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid not null unique references public.seances (id) on delete cascade,
  nom text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  membre_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'member')),
  added_at timestamptz not null default now(),
  primary key (group_id, membre_id)
);

create index if not exists chat_group_members_membre_idx
  on public.chat_group_members (membre_id);

create table if not exists public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  contenu text,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists chat_group_messages_group_created_idx
  on public.chat_group_messages (group_id, created_at desc);

create table if not exists public.chat_group_reads (
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Helpers private.* (security definer — évite la récursion RLS)
-- ---------------------------------------------------------------------------

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_chat_group_admin(p_group uuid)
returns boolean
language plpgsql
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

create or replace function private.is_chat_group_member(p_group uuid)
returns boolean
language plpgsql
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
    where m.group_id = p_group
      and m.membre_id = auth.uid()
  );
end;
$$;

create or replace function private.shares_chat_group(p_profile uuid)
returns boolean
language plpgsql
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

grant execute on function private.is_chat_group_admin(uuid) to authenticated;
grant execute on function private.is_chat_group_member(uuid) to authenticated;
grant execute on function private.shares_chat_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- ensure_seance_chat_group — crée / synchronise le groupe d'une séance
-- ---------------------------------------------------------------------------

create or replace function public.ensure_seance_chat_group(p_seance_id uuid)
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
    insert into public.chat_groups (seance_id, nom)
    values (p_seance_id, coalesce(nullif(trim(v_seance.nom), ''), 'مجموعة الحصة'))
    returning id into v_group_id;
  end if;

  -- Superviseur = admin du groupe
  if v_seance.superviseur_id is not null then
    insert into public.chat_group_members (group_id, membre_id, role)
    values (v_group_id, v_seance.superviseur_id, 'admin')
    on conflict (group_id, membre_id) do update
      set role = 'admin';

    -- Ancien superviseur : rétrograder (garder comme membre s'il est encore inscrit)
    update public.chat_group_members
    set role = 'member'
    where group_id = v_group_id
      and role = 'admin'
      and membre_id <> v_seance.superviseur_id;
  end if;

  -- Membres acceptés de la séance
  insert into public.chat_group_members (group_id, membre_id, role)
  select v_group_id, i.membre_id, 'member'
  from public.inscriptions i
  where i.seance_id = p_seance_id
    and i.statut = 'accepte'
    and i.membre_id is not null
    and (v_seance.superviseur_id is null or i.membre_id <> v_seance.superviseur_id)
  on conflict (group_id, membre_id) do nothing;

  return v_group_id;
end;
$$;

grant execute on function public.ensure_seance_chat_group(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers de synchronisation
-- ---------------------------------------------------------------------------

create or replace function public.trg_seances_ensure_chat_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'active' and new.superviseur_id is not null then
    perform public.ensure_seance_chat_group(new.id);
  end if;
  -- Si le nom de séance change et que le groupe porte encore l'ancien nom, on
  -- ne force PAS le renommage (le superviseur peut avoir personnalisé le nom).
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
declare
  v_group_id uuid;
  v_superviseur uuid;
begin
  if new.seance_id is null or new.membre_id is null then
    return new;
  end if;

  select g.id, s.superviseur_id
    into v_group_id, v_superviseur
  from public.chat_groups g
  join public.seances s on s.id = g.seance_id
  where g.seance_id = new.seance_id;

  if v_group_id is null then
    -- Groupe pas encore créé : tenter la création puis recharger
    v_group_id := public.ensure_seance_chat_group(new.seance_id);
    if v_group_id is null then
      return new;
    end if;
    select s.superviseur_id into v_superviseur
    from public.seances s where s.id = new.seance_id;
  end if;

  if new.statut = 'accepte' then
    -- Ne pas écraser le rôle admin du superviseur
    if v_superviseur is not null and new.membre_id = v_superviseur then
      insert into public.chat_group_members (group_id, membre_id, role)
      values (v_group_id, new.membre_id, 'admin')
      on conflict (group_id, membre_id) do update set role = 'admin';
    else
      insert into public.chat_group_members (group_id, membre_id, role)
      values (v_group_id, new.membre_id, 'member')
      on conflict (group_id, membre_id) do nothing;
    end if;
  elsif new.statut = 'retire' then
    -- Ne jamais retirer l'admin (superviseur)
    delete from public.chat_group_members
    where group_id = v_group_id
      and membre_id = new.membre_id
      and role <> 'admin';
  end if;

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
-- Guard : seance_id immuable sur chat_groups
-- ---------------------------------------------------------------------------

create or replace function public.chat_groups_guard_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.seance_id is distinct from old.seance_id then
    raise exception 'seance_id du groupe ne peut pas être modifié';
  end if;
  if new.id is distinct from old.id then
    raise exception 'id du groupe ne peut pas être modifié';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chat_groups_guard_immutable on public.chat_groups;
create trigger chat_groups_guard_immutable
  before update on public.chat_groups
  for each row
  execute function public.chat_groups_guard_immutable();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;
alter table public.chat_group_reads enable row level security;

grant select on table public.chat_groups to authenticated;
grant update (nom, avatar_url, updated_at) on table public.chat_groups to authenticated;

grant select, insert, delete on table public.chat_group_members to authenticated;

grant select, insert on table public.chat_group_messages to authenticated;

grant select, insert, update on table public.chat_group_reads to authenticated;

-- chat_groups
drop policy if exists chat_groups_select_member on public.chat_groups;
create policy chat_groups_select_member
  on public.chat_groups for select
  to authenticated
  using (
    private.is_chat_group_member(id)
    or private.is_admin()
  );

drop policy if exists chat_groups_update_admin on public.chat_groups;
create policy chat_groups_update_admin
  on public.chat_groups for update
  to authenticated
  using (private.is_chat_group_admin(id))
  with check (private.is_chat_group_admin(id));

-- chat_group_members
drop policy if exists chat_group_members_select on public.chat_group_members;
create policy chat_group_members_select
  on public.chat_group_members for select
  to authenticated
  using (
    private.is_chat_group_member(group_id)
    or private.is_admin()
  );

drop policy if exists chat_group_members_insert_admin on public.chat_group_members;
create policy chat_group_members_insert_admin
  on public.chat_group_members for insert
  to authenticated
  with check (
    private.is_chat_group_admin(group_id)
    and (
      -- Admin du groupe (superviseur) : toujours autorisé
      role = 'admin'
      or exists (
        select 1
        from public.chat_groups g
        join public.inscriptions i on i.seance_id = g.seance_id
        where g.id = group_id
          and i.membre_id = membre_id
          and i.statut = 'accepte'
      )
    )
  );

drop policy if exists chat_group_members_delete_admin on public.chat_group_members;
create policy chat_group_members_delete_admin
  on public.chat_group_members for delete
  to authenticated
  using (
    private.is_chat_group_admin(group_id)
    and role <> 'admin'
  );

-- chat_group_messages
drop policy if exists chat_group_messages_select on public.chat_group_messages;
create policy chat_group_messages_select
  on public.chat_group_messages for select
  to authenticated
  using (private.is_chat_group_member(group_id));

drop policy if exists chat_group_messages_insert on public.chat_group_messages;
create policy chat_group_messages_insert
  on public.chat_group_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and private.is_chat_group_member(group_id)
  );

-- chat_group_reads
drop policy if exists chat_group_reads_select_own on public.chat_group_reads;
create policy chat_group_reads_select_own
  on public.chat_group_reads for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists chat_group_reads_insert_own on public.chat_group_reads;
create policy chat_group_reads_insert_own
  on public.chat_group_reads for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and private.is_chat_group_member(group_id)
  );

drop policy if exists chat_group_reads_update_own on public.chat_group_reads;
create policy chat_group_reads_update_own
  on public.chat_group_reads for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- profiles : pairs d'un même groupe (noms / avatars dans la conversation)
drop policy if exists profiles_select_chat_group_peer on public.profiles;
create policy profiles_select_chat_group_peer
  on public.profiles for select
  to authenticated
  using (private.shares_chat_group(id));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.chat_group_messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.chat_group_messages;
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill : groupes pour toutes les séances actives avec superviseur
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select id from public.seances
    where statut = 'active'
      and superviseur_id is not null
  loop
    perform public.ensure_seance_chat_group(r.id);
  end loop;
end;
$$;

commit;
