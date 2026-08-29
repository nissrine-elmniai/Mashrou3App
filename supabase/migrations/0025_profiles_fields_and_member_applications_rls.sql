-- MIGRATION 0025 — colonnes profiles (phone, school, level, hifz_amount)
-- + lecture member_applications pour le superviseur (membres de sa séance)
-- + copie des champs vers profiles à l'activation de la demande

alter table public.profiles
  add column if not exists phone text,
  add column if not exists school text,
  add column if not exists level text,
  add column if not exists hifz_amount text;

-- Superviseur : lire la demande d'inscription des membres de sa séance
drop policy if exists "member_applications_select_superviseur" on public.member_applications;
create policy "member_applications_select_superviseur"
  on public.member_applications for select
  using (
    exists (
      select 1
      from public.inscriptions i
      join public.seances s on s.id = i.seance_id
      where i.membre_id = member_applications.user_id
        and i.statut = 'accepte'
        and s.superviseur_id = auth.uid()
    )
  );

-- Recopie phone/school/level/hifz vers profiles à l'activation
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
      updated_at = now()
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists member_applications_sync_profile on public.member_applications;
create trigger member_applications_sync_profile
  after insert or update of status, phone, school, level, hifz_amount
  on public.member_applications
  for each row execute function public.sync_profile_from_member_application();

-- Backfill ponctuel : membres déjà activés
update public.profiles p
set
  phone = coalesce(p.phone, ma.phone),
  school = coalesce(p.school, ma.school),
  level = coalesce(p.level, ma.level),
  hifz_amount = coalesce(p.hifz_amount, ma.hifz_amount),
  updated_at = now()
from public.member_applications ma
where ma.user_id = p.id
  and ma.status = 'activated'
  and (
    p.phone is null or p.school is null or p.level is null or p.hifz_amount is null
  );
