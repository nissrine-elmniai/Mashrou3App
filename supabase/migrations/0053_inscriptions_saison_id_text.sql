-- MIGRATION 0053 — inscriptions.saison_id en TEXT + backfill depuis seances
--
-- Contexte : sur la base distante, inscriptions.saison_id existait déjà en uuid
-- (schéma historique) quand 0034 a fait `add column if not exists ... text`.
-- Résultat : la colonne est restée uuid, toujours null, et tout filtre
-- `.eq("saison_id", "s_…")` échoue avec « invalid input syntax for type uuid ».
-- Les ids de musim sont du texte partout ailleurs (saisons.id, seances.saison_id).

-- 1. Type texte (idempotent)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inscriptions'
      and column_name = 'saison_id'
      and udt_name = 'uuid'
  ) then
    drop index if exists public.inscriptions_membre_saison_accepte_unique;
    drop index if exists public.inscriptions_saison_idx;
    alter table public.inscriptions
      alter column saison_id type text using saison_id::text;
  end if;
end $$;

alter table public.inscriptions
  add column if not exists saison_id text;

-- 2. Backfill depuis la séance liée
update public.inscriptions i
set saison_id = s.saison_id
from public.seances s
where i.seance_id = s.id
  and i.saison_id is null
  and s.saison_id is not null;

-- 3. Index (l'unique est tenté séparément : il échoue si des doublons
--    membre/musim existent déjà — à nettoyer manuellement dans ce cas)
create index if not exists inscriptions_saison_idx
  on public.inscriptions (saison_id);

do $$
begin
  create unique index if not exists inscriptions_membre_saison_accepte_unique
    on public.inscriptions (membre_id, saison_id)
    where statut = 'accepte' and saison_id is not null;
exception
  when unique_violation then
    raise notice 'inscriptions_membre_saison_accepte_unique non créé : doublons membre/musim à nettoyer';
end $$;

-- 4. Trigger de synchronisation (recréé pour être sûr qu'il existe)
create or replace function public.sync_inscription_saison_id()
returns trigger
language plpgsql
as $$
begin
  if new.seance_id is not null then
    select s.saison_id into new.saison_id
    from public.seances s
    where s.id = new.seance_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_inscription_saison_id on public.inscriptions;
create trigger trg_sync_inscription_saison_id
  before insert or update of seance_id on public.inscriptions
  for each row
  execute function public.sync_inscription_saison_id();

notify pgrst, 'reload schema';
