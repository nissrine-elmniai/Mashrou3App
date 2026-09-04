-- 0047_profiles_role_guard.sql
-- Empêche l'auto-attribution d'un rôle via profiles.role / profiles.roles.
-- Contexte : GRANT UPDATE sur toutes les colonnes + policy profiles_update_own
-- sans WITH CHECK => tout compte authentifié pouvait se promouvoir admin en
-- écrivant roles = ['admin'] (sync_profile_roles propageait ensuite sur role).

create or replace function private.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- service_role, postgres, jobs internes : non concernés
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- un admin peut promouvoir ou rétrograder
  if private.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- création de profil par l'utilisateur : rôle forcé à membre
    new.role  := 'member';
    new.roles := array['member']::text[];
    return new;
  end if;

  -- UPDATE : role et roles restaurés silencieusement
  new.role  := old.role;
  new.roles := old.roles;
  return new;
end;
$function$;

-- Nom choisi pour passer AVANT profiles_sync_roles (ordre alphabétique)
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before insert or update on public.profiles
  for each row execute function private.profiles_guard_role();