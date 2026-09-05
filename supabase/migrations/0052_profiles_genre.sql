-- MIGRATION 0052 — genre (sexe) sur profiles + sync depuis member_applications
-- Corrige l'affichage « الجنس: — » après activation du compte membre.

alter table public.profiles
  add column if not exists genre text;

alter table public.profiles
  drop constraint if exists profiles_genre_check;

alter table public.profiles
  add constraint profiles_genre_check
  check (genre is null or genre in ('ذكر', 'أنثى'));

-- Recopie phone/school/level/hifz/genre vers profiles à l'activation
create or replace function public.sync_profile_from_member_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'activated' and new.user_id is not null then
    update public.profiles
    set
      phone = coalesce(new.phone, phone),
      school = coalesce(new.school, school),
      level = coalesce(new.level, level),
      hifz_amount = coalesce(new.hifz_amount, hifz_amount),
      genre = coalesce(new.genre, genre),
      updated_at = now()
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists member_applications_sync_profile on public.member_applications;
create trigger member_applications_sync_profile
  after insert or update of status, phone, school, level, hifz_amount, genre, user_id
  on public.member_applications
  for each row execute function public.sync_profile_from_member_application();

-- Backfill : membres déjà activés
update public.profiles p
set
  phone = coalesce(p.phone, ma.phone),
  school = coalesce(p.school, ma.school),
  level = coalesce(p.level, ma.level),
  hifz_amount = coalesce(p.hifz_amount, ma.hifz_amount),
  genre = coalesce(p.genre, ma.genre),
  updated_at = now()
from public.member_applications ma
where ma.user_id = p.id
  and ma.status = 'activated'
  and (
    p.phone is null
    or p.school is null
    or p.level is null
    or p.hifz_amount is null
    or p.genre is null
  );

-- Aussi les demandes invited/activated liées par e-mail si user_id manquant
update public.profiles p
set
  genre = coalesce(p.genre, ma.genre),
  updated_at = now()
from public.member_applications ma
where p.genre is null
  and ma.genre is not null
  and lower(ma.email) = lower(coalesce(p.canonical_email, p.email))
  and ma.status in ('activated', 'invited');

notify pgrst, 'reload schema';
