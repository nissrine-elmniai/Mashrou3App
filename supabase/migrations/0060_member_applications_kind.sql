-- MIGRATION 0060 — kind sur member_applications (join vs season_renewal)
-- Permet de persister les réinscriptions saison sans les confondre avec
-- les demandes d'intégration, et évite l'auto-activation des renewals.

alter table public.member_applications
  add column if not exists kind text;

update public.member_applications
set kind = 'join'
where kind is null;

alter table public.member_applications
  alter column kind set default 'join';

alter table public.member_applications
  alter column kind set not null;

alter table public.member_applications
  drop constraint if exists member_applications_kind_check;

alter table public.member_applications
  add constraint member_applications_kind_check
  check (kind in ('join', 'season_renewal'));

create index if not exists member_applications_kind_idx
  on public.member_applications (kind);

create index if not exists member_applications_user_season_idx
  on public.member_applications (user_id, season_id)
  where kind = 'season_renewal';

-- Ne lier / activer automatiquement que les demandes d'intégration (join)
create or replace function public.link_member_application_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'member' and new.email is not null then
    update public.member_applications
    set
      status = 'activated',
      user_id = new.id,
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
    where lower(email) = lower(new.email)
      and status in ('invited', 'pending')
      and coalesce(kind, 'join') = 'join';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
