-- MIGRATION 0036 — saison_id text + heures optionnelles sur seances
-- À exécuter après 0035_saisons.sql

alter table public.seances
  drop constraint if exists seances_saison_id_fkey;

-- L'app utilise des identifiants texte (ex. s_bootstrap), pas des UUID
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'seances'
      and column_name = 'saison_id'
      and udt_name = 'uuid'
  ) then
    alter table public.seances
      alter column saison_id type text using saison_id::text;
  end if;
end $$;

alter table public.seances
  alter column heure_debut drop not null;

alter table public.seances
  alter column heure_fin drop not null;

notify pgrst, 'reload schema';
