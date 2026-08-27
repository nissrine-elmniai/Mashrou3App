-- À coller dans Supabase → SQL Editor, puis Run.
-- MIGRATION 0019 — aligner l'ancienne table messages avec l'app
-- À exécuter après 0018_messages_id_default.sql
--
-- Symptôme : null value in column "from_user_id" of relation "messages"
-- Cause : la table live a été créée avec from_user_id / to_user_id (NOT NULL),
-- alors que l'app insère sender_id / recipient_id. Les deux coexistent,
-- from_user_id reste NULL, PostgreSQL refuse l'INSERT.

create extension if not exists pgcrypto;

-- Colonnes attendues par l'app
alter table public.messages add column if not exists sender_id uuid references public.profiles (id);
alter table public.messages add column if not exists recipient_id uuid references public.profiles (id);
alter table public.messages add column if not exists seance_id uuid;
alter table public.messages add column if not exists contenu text;
alter table public.messages add column if not exists image_url text;
alter table public.messages alter column id set default gen_random_uuid();

-- Recopie l'ancien schéma -> le nouveau (si les colonnes legacy existent)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'from_user_id'
  ) then
    execute $sql$
      update public.messages
      set sender_id = from_user_id
      where sender_id is null and from_user_id is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'to_user_id'
  ) then
    execute $sql$
      update public.messages
      set recipient_id = to_user_id
      where recipient_id is null and to_user_id is not null
    $sql$;
  end if;
end $$;

-- Remplit les colonnes legacy au moment de l'INSERT, pour respecter les NOT NULL.
create or replace function public.messages_sync_legacy_columns()
returns trigger
language plpgsql
as $$
declare
  payload jsonb := to_jsonb(NEW);
begin
  if payload->>'id' is null then
    payload := jsonb_set(payload, '{id}', to_jsonb(gen_random_uuid()));
  end if;

  if payload ? 'from_user_id' then
    if payload->>'from_user_id' is null and payload->>'sender_id' is not null then
      payload := jsonb_set(payload, '{from_user_id}', payload->'sender_id');
    end if;
    if payload->>'sender_id' is null and payload->>'from_user_id' is not null then
      payload := jsonb_set(payload, '{sender_id}', payload->'from_user_id');
    end if;
  end if;

  if payload ? 'to_user_id' then
    if payload->>'to_user_id' is null and payload->>'recipient_id' is not null then
      payload := jsonb_set(payload, '{to_user_id}', payload->'recipient_id');
    end if;
    if payload->>'recipient_id' is null and payload->>'to_user_id' is not null then
      payload := jsonb_set(payload, '{recipient_id}', payload->'to_user_id');
    end if;
  end if;

  if payload ? 'body' and payload->>'body' is null and payload->>'contenu' is not null then
    payload := jsonb_set(payload, '{body}', payload->'contenu');
  end if;
  if payload ? 'content' and payload->>'content' is null and payload->>'contenu' is not null then
    payload := jsonb_set(payload, '{content}', payload->'contenu');
  end if;
  if payload ? 'text' and payload->>'text' is null and payload->>'contenu' is not null then
    payload := jsonb_set(payload, '{text}', payload->'contenu');
  end if;
  if payload ? 'message' and payload->>'message' is null and payload->>'contenu' is not null then
    payload := jsonb_set(payload, '{message}', payload->'contenu');
  end if;

  NEW := jsonb_populate_record(NEW, payload);
  return NEW;
end;
$$;

drop trigger if exists messages_sync_legacy_columns on public.messages;
create trigger messages_sync_legacy_columns
  before insert or update on public.messages
  for each row
  execute procedure public.messages_sync_legacy_columns();

notify pgrst, 'reload schema';
