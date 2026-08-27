-- MIGRATION 0015 — test_invitations.membre_id → on delete cascade
-- À exécuter après supabase/migrations/0014_alerts.sql
--
-- BUT : la FK test_invitations.membre_id -> profiles(id) créée en 0005 est
-- SANS clause on delete (défaut NO ACTION). On la remplace par CASCADE.

-- Supprime TOUTE contrainte FK existante sur la colonne membre_id,
-- quel que soit son nom (même un nom généré automatiquement par Postgres).
do $$
declare
  rec record;
begin
  for rec in
    select con.conname as name
    from pg_constraint con
    where con.conrelid = 'public.test_invitations'::regclass
      and con.contype = 'f'
      and array_position(con.conkey, (
        select attnum
        from pg_attribute
        where attrelid = 'public.test_invitations'::regclass
          and attname = 'membre_id'
      )) is not null
  loop
    execute format('alter table public.test_invitations drop constraint %I', rec.name);
  end loop;
end;
$$;

-- Recrée la contrainte avec ON DELETE CASCADE
alter table public.test_invitations
add constraint test_invitations_membre_id_fkey
  foreign key (membre_id) references public.profiles (id) on delete cascade;

-- Rechargement du cache de schéma PostgREST
notify pgrst, 'reload schema';

-- Vérification (SQL Editor) :
--   select c.conname, c.confdeltype
--   from pg_constraint c
--   where c.conrelid = 'public.test_invitations'::regclass
--     and c.contype = 'f';
-- (confdeltype 'c' = cascade)