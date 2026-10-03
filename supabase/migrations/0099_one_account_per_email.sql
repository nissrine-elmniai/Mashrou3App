-- 0099 — une personne, un seul compte.
-- Invitation superviseur : refus si un profil existe déjà pour cette adresse.
-- Inscription membre : refus si un profil superviseur ou une invitation
-- superviseur pending existe pour cette adresse.
-- Pas d'index unique sur lower(profiles.email) : le doublon
-- elaammarioumeima@gmail.com / supervisor@gmail.com est encore en base.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

begin;

create or replace function public.reject_supervisor_invitation_if_email_taken()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mail text := lower(trim(coalesce(new.email, '')));
begin
  if v_mail = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles p
    where lower(trim(coalesce(p.email, ''))) = v_mail
       or lower(trim(coalesce(p.canonical_email, ''))) = v_mail
  ) then
    raise exception 'هذا البريد مستعمل من طرف حساب آخر'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.reject_member_application_if_supervisor_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mail text := lower(trim(coalesce(new.email, '')));
begin
  if v_mail = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles p
    where (
      lower(trim(coalesce(p.email, ''))) = v_mail
      or lower(trim(coalesce(p.canonical_email, ''))) = v_mail
    )
    and (
      p.role = 'supervisor'
      or (p.roles is not null and 'supervisor' = any (p.roles))
    )
  ) then
    raise exception 'هذا البريد مستعمل من طرف حساب مشرف'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.supervisor_invitations i
    where lower(trim(coalesce(i.email, ''))) = v_mail
      and i.status = 'pending'
  ) then
    raise exception 'هذا البريد مرتبط بدعوة مشرف'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_supervisor_invitation_if_email_taken() from public;
revoke all on function public.reject_member_application_if_supervisor_email() from public;

drop trigger if exists supervisor_invitations_reject_taken_email
  on public.supervisor_invitations;
create trigger supervisor_invitations_reject_taken_email
  before insert on public.supervisor_invitations
  for each row
  execute function public.reject_supervisor_invitation_if_email_taken();

drop trigger if exists member_applications_reject_supervisor_email
  on public.member_applications;
create trigger member_applications_reject_supervisor_email
  before insert on public.member_applications
  for each row
  execute function public.reject_member_application_if_supervisor_email();

notify pgrst, 'reload schema';

commit;
