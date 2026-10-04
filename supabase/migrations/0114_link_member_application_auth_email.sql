-- 0114_link_member_application_auth_email.sql
-- Le rattachement d'une demande invited se fait sur l'email du compte Auth,
-- pas sur profiles.email (modifiable par le membre).
-- handle_new_user (0082) écrit profiles.email depuis auth.users.email :
-- pas de correctif de handle_new_user dans ce lot.
-- Le trigger on_profile_link_member_application n'est pas recréé.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Un seul script = une transaction.

create or replace function public.link_member_application_on_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text;
begin
  -- Profil déjà membre avant et après : rien à faire
  if tg_op = 'UPDATE'
     and private.profile_has_role(old.id, 'member')
     and private.profile_has_role(new.id, 'member') then
    return new;
  end if;

  select u.email
    into v_email
  from auth.users u
  where u.id = new.id;

  -- Seules les candidatures acceptées par l'admin (invited) sont activées
  if private.profile_has_role(new.id, 'member') and v_email is not null then
    update public.member_applications
    set
      status = 'activated',
      user_id = new.id,
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
    where lower(email) = lower(v_email)
      and status = 'invited';
  end if;

  return new;
end;
$function$;
