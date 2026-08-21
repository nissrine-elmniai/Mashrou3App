-- À coller dans Supabase → SQL Editor, puis Run.
-- MIGRATION 0017 — chat membre <-> admin + Realtime fiable
-- À exécuter après supabase/migrations/0016_tests_types.sql
--
-- 1) Autorise la paire membre <-> admin (la direction), en plus des paires
--    déjà prévues en 0006 (membre <-> superviseur, superviseur <-> admin).
-- 2) Le membre peut lire le profil admin (pour résoudre le destinataire).
-- 3) REPLICA IDENTITY FULL : sans cela, Realtime + RLS n'envoie pas le
--    payload complet, donc le destinataire ne voit pas le message tout de suite.

-- ---------------------------------------------------------------------------
-- private.is_member() — même contrat que private.is_supervisor() (0009)
-- ---------------------------------------------------------------------------
create or replace function private.is_member()
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
      and p.role = 'member'
  );
end;
$$;

grant execute on function private.is_member() to authenticated;

-- Membre : peut lire le profil des admins (chat membre <-> administration).
drop policy if exists "profiles_select_membre_admin" on public.profiles;
create policy "profiles_select_membre_admin"
  on public.profiles
  for select
  using (private.is_member() and role = 'admin');

-- ---------------------------------------------------------------------------
-- RG6 étendu : cas 4 membre <-> admin (séance facultative)
-- ---------------------------------------------------------------------------
create or replace function private.messages_pair_authorized(
  p_sender uuid,
  p_recipient uuid,
  p_seance uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_role text;
  v_recipient_role text;
begin
  if p_sender is null or p_recipient is null then
    return false;
  end if;

  select role into v_sender_role
  from public.profiles where id = p_sender;
  select role into v_recipient_role
  from public.profiles where id = p_recipient;

  if v_sender_role is null or v_recipient_role is null then
    return false;
  end if;

  -- Cas 1 — membre -> superviseur de SA séance
  if v_sender_role = 'member' and v_recipient_role = 'supervisor' then
    return exists (
      select 1
      from public.seances s
      join public.inscriptions i on i.seance_id = s.id
      where i.membre_id = p_sender
        and i.statut = 'accepte'
        and s.superviseur_id = p_recipient
        and s.id = p_seance
    );
  end if;

  -- Cas 2 — superviseur -> membre inscrit dans SA séance
  if v_sender_role = 'supervisor' and v_recipient_role = 'member' then
    return exists (
      select 1
      from public.seances s
      join public.inscriptions i on i.seance_id = s.id
      where i.membre_id = p_recipient
        and i.statut = 'accepte'
        and s.superviseur_id = p_sender
        and s.id = p_seance
    );
  end if;

  -- Cas 3 — superviseur <-> admin
  if (v_sender_role = 'supervisor' and v_recipient_role = 'admin')
     or (v_sender_role = 'admin' and v_recipient_role = 'supervisor') then
    if p_seance is null then
      return true;
    end if;
    return exists (
      select 1
      from public.seances s
      where s.id = p_seance
        and (s.superviseur_id = p_sender or s.superviseur_id = p_recipient)
    );
  end if;

  -- Cas 4 — membre <-> admin (direction). Séance facultative : si fournie,
  -- le membre du binôme doit y être inscrit 'accepte'.
  if (v_sender_role = 'member' and v_recipient_role = 'admin')
     or (v_sender_role = 'admin' and v_recipient_role = 'member') then
    if p_seance is null then
      return true;
    end if;
    return exists (
      select 1
      from public.inscriptions i
      where i.statut = 'accepte'
        and i.seance_id = p_seance
        and (i.membre_id = p_sender or i.membre_id = p_recipient)
    );
  end if;

  return false;
end;
$$;

grant execute on function private.messages_pair_authorized(uuid, uuid, uuid)
  to authenticated;

-- Realtime : payload complet pour que RLS filtre correctement les INSERT.
alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

notify pgrst, 'reload schema';
