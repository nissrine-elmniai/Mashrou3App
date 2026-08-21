-- À coller dans Supabase → SQL Editor, puis Run.
-- MIGRATION 0018 — default UUID sur messages.id
-- À exécuter après supabase/migrations/0017_messages_member_admin_realtime.sql
--
-- Si la table messages existait AVANT 0006, `create table if not exists`
-- n'a pas appliqué `default gen_random_uuid()`. L'INSERT sans id échoue :
--   null value in column "id" of relation "messages" violates not-null constraint

create extension if not exists pgcrypto;

alter table public.messages
  alter column id set default gen_random_uuid();
