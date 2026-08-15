-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0006 — table messages (chat membre <-> superviseur,
-- superviseur <-> admin) + Realtime. RG6 : chat cloisonné.
-- À exécuter après supabase/migrations/0005_tests.sql

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid references public.seances (id) on delete cascade,
  sender_id uuid references public.profiles (id),
  recipient_id uuid references public.profiles (id),
  contenu text,
  image_url text,
  created_at timestamptz not null default now()
);

-- ⬇️ AJOUT : colonnes manquantes si la table existait déjà
alter table public.messages add column if not exists seance_id uuid references public.seances (id) on delete cascade;
alter table public.messages add column if not exists sender_id uuid references public.profiles (id);
alter table public.messages add column if not exists recipient_id uuid references public.profiles (id);
alter table public.messages add column if not exists contenu text;
alter table public.messages add column if not exists image_url text;
alter table public.messages add column if not exists created_at timestamptz not null default now();

create index if not exists messages_conversation_idx
  on public.messages (sender_id, recipient_id, created_at);

alter table public.messages enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on table public.messages to authenticated;

-- Schéma private : non exposé par défaut à l'API PostgREST (seul le schéma
-- public est exposé via /rest/v1/). Il héberge la fonction interne appelée
-- par les policies RLS de messages, afin qu'aucun utilisateur ne puisse
-- l'appeler directement via /rest/v1/rpc/ (ce qui permettrait de carto-
-- graphier les relations superviseur/membre/admin en testant des UUID).
create schema if not exists private;
-- Les expressions de policies RLS sont évaluées avec les privilèges de
-- l'utilisateur qui exécute la requête : le rôle authenticated (le seul à
-- avoir accès à messages) doit donc pouvoir exécuter la fonction interne.
grant usage on schema private to authenticated;

-- ===========================================================================
-- RG6 — Autorisation d'une paire de conversation.
-- ===========================================================================
-- Fonction interne hébergée dans le schéma private : elle n'est PAS exposée
-- par PostgREST (/rest/v1/rpc/) — seules les policies RLS et les procédures
-- SQL la font exécuter. Elle est security definer : ses requêtes internes
-- (profiles, inscriptions, seances) s'exécutent avec les droits du
-- propriétaire des tables et ne sont donc PAS soumises à RLS. C'est
-- indispensable : les policies doivent inspecter le rôle et l'affectation
-- de l'AUTRE partie, or les policies ordinaires sur profiles ne permettent
-- que la lecture de sa propre ligne (profiles_select_own).
--
-- Pas de fuite de données : les policies n'appellent cette fonction qu'après
-- avoir vérifié que l'appelant est bien l'expéditeur ou le destinataire
-- (cf. messages_select_authorized / messages_insert_authorized). Elle ne
-- révèle au pire que l'existence d'une paire autorisée, information déjà
-- inférable depuis le chat lui-même.
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
  -- Identité manquante -> conversation impossible
  if p_sender is null or p_recipient is null then
    return false;
  end if;

  -- Rôles des deux parties (requêtes internes non filtrées par RLS,
  -- cf. commentaire d'en-tête de la fonction)
  select role into v_sender_role
  from public.profiles where id = p_sender;
  select role into v_recipient_role
  from public.profiles where id = p_recipient;

  -- Profil inconnu -> refus
  if v_sender_role is null or v_recipient_role is null then
    return false;
  end if;

  -- -------------------------------------------------------------------------
  -- Cas 1 — membre expéditeur vers le superviseur de SA séance.
  -- Autorise uniquement le superviseur de la séance dans laquelle le membre
  -- est inscrit avec statut 'accepte', et uniquement un message rattaché à
  -- CETTE séance (cloisonnement : le membre ne peut pas discuter à travers
  -- une autre séance, même avec son superviseur).
  -- -------------------------------------------------------------------------
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

  -- -------------------------------------------------------------------------
  -- Cas 2 — superviseur expéditeur vers un membre inscrit dans SA séance.
  -- Symétrique du cas 1 : le superviseur ne peut écrire qu'à un membre
  -- 'accepte' d'une de SES séances, et uniquement dans le cadre de cette
  -- séance. Il ne peut donc pas discuter avec un membre d'une autre séance.
  -- -------------------------------------------------------------------------
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

  -- -------------------------------------------------------------------------
  -- Cas 3 — superviseur <-> admin (la direction).
  -- p_seance peut être NULL (discussion de gestion hors séance) : autorisé.
  -- Si une séance est fournie, elle doit appartenir au superviseur du binôme
  -- (on ne peut pas rattacher une discussion à la séance d'un autre).
  -- -------------------------------------------------------------------------
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

  -- -------------------------------------------------------------------------
  -- Cas 4 — toutes les autres paires (membre <-> membre, membre <-> admin,
  -- admin <-> admin...) : refusées. RG6 limite le chat aux cas 1 à 3.
  -- -------------------------------------------------------------------------
  return false;
end;
$$;

-- Exécution accordée uniquement au rôle authenticated (évaluation des
-- policies) : anon n'a aucun accès à messages, service_role contourne RLS.
grant execute on function private.messages_pair_authorized(uuid, uuid, uuid)
  to authenticated;

-- Suppression de l'éventuelle ancienne version publique (déployée avant ce
-- correctif) : la fonction ne doit plus exister dans le schéma public et
-- n'est donc plus atteignable via /rest/v1/rpc/messages_pair_authorized.
drop function if exists public.messages_pair_authorized(uuid, uuid, uuid);

-- Lecture : on ne voit que les messages dont on est expéditeur OU
-- destinataire, et seulement si la paire est autorisée (RG6).
drop policy if exists "messages_select_authorized" on public.messages;
create policy "messages_select_authorized"
  on public.messages
  for select
  using (
    (sender_id = auth.uid() or recipient_id = auth.uid())
    and private.messages_pair_authorized(sender_id, recipient_id, seance_id)
  );

-- Insertion : on ne peut envoyer qu'en tant que soi-même, vers une paire
-- autorisée (RG6), dans une séance éligible.
drop policy if exists "messages_insert_authorized" on public.messages;
create policy "messages_insert_authorized"
  on public.messages
  for insert
  with check (
    sender_id = auth.uid()
    and private.messages_pair_authorized(sender_id, recipient_id, seance_id)
  );

-- ===========================================================================
-- Realtime — publication des nouveaux messages.
-- La publication supabase_realtime est créée par défaut sur chaque projet
-- Supabase (Dashboard → Database → Replication) ; aucune publication n'est
-- déclarée dans le dépôt, on ajoute donc la table sans recréer la
-- publication. Le bloc DO rend l'instruction idempotente. Si la publication
-- n'existait pas (projet inhabituel), la créer manuellement :
--   create publication supabase_realtime with (publish = 'insert, update, delete');
-- ===========================================================================
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