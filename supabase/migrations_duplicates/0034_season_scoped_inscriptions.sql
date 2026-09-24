-- MIGRATION 0034 — inscriptions liées au musim (saison_id)
-- À exécuter après 0033_seances_genre.sql
--
-- Permet à un membre d'avoir une inscription acceptée par musim
-- (et non plus une seule inscription globale).

alter table public.inscriptions
  add column if not exists saison_id text;

update public.inscriptions i
set saison_id = s.saison_id
from public.seances s
where i.seance_id = s.id
  and i.saison_id is null
  and s.saison_id is not null;

drop index if exists public.inscriptions_membre_accepte_unique;

create unique index if not exists inscriptions_membre_saison_accepte_unique
  on public.inscriptions (membre_id, saison_id)
  where statut = 'accepte' and saison_id is not null;

create index if not exists inscriptions_saison_idx
  on public.inscriptions (saison_id);

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
