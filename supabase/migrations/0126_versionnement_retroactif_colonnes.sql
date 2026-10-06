-- Migration rétroactive : ces objets existent déjà en base (créés hors dépôt).
-- Relancer le fichier ne change rien : ADD COLUMN IF NOT EXISTS est sans effet
-- si la colonne est là, et la contrainte n'est ajoutée que si son nom est absent.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

alter table public.seances
  add column if not exists genre text;

alter table public.member_applications
  add column if not exists genre text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inscriptions'::regclass
      and conname = 'inscriptions_membre_id_saison_id_key'
  ) then
    alter table public.inscriptions
      add constraint inscriptions_membre_id_saison_id_key
      unique (membre_id, saison_id);
  end if;
end
$$;

notify pgrst, 'reload schema';
