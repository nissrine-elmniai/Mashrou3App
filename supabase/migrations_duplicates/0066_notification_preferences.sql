-- 0066_notification_preferences.sql
-- Un booléen par catégorie (default true). quiet_hours_* réservés, non lus au lot 0.
--
-- Création de la ligne : trigger AFTER INSERT sur profiles (même transaction
-- que handle_new_user) + INSERT client autorisé en filet si un profil ancien
-- n'a pas de ligne. Plus robuste qu'un seul get-or-create côté app (course
-- possible, et l'Edge Function doit trouver une ligne sans round-trip client).

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  chat boolean not null default true,
  presence boolean not null default true,
  inscriptions boolean not null default true,
  seances boolean not null default true,
  progression boolean not null default true,
  alertes boolean not null default true,
  systeme boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

revoke all on table public.notification_preferences from public, anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;
grant all on table public.notification_preferences to postgres, service_role;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function private.notification_preferences_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_notification_preferences_on_profile on public.profiles;
create trigger trg_notification_preferences_on_profile
  after insert on public.profiles
  for each row
  execute function private.notification_preferences_on_profile();

insert into public.notification_preferences (user_id)
select p.id
from public.profiles p
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
