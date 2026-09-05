-- MIGRATION 0051 — date/heure d'inscription membre (notifications filtrées)
-- Enregistre date_inscription (timestamptz) à l'affectation séance.
-- Note : certaines bases n'ont pas created_at sur inscriptions — ne pas y dépendre.

alter table public.inscriptions
  add column if not exists date_inscription timestamptz;

-- Backfill sans created_at (peut être absent sur le schéma distant)
update public.inscriptions
set date_inscription = now()
where date_inscription is null;

alter table public.inscriptions
  alter column date_inscription set default now();

alter table public.inscriptions
  alter column date_inscription set not null;

create or replace function public.set_inscription_date_default()
returns trigger
language plpgsql
as $$
begin
  if new.date_inscription is null then
    new.date_inscription := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inscriptions_date_default on public.inscriptions;
create trigger trg_inscriptions_date_default
  before insert on public.inscriptions
  for each row
  execute function public.set_inscription_date_default();

notify pgrst, 'reload schema';
