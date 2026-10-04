-- 0115_link_member_application_old_new_roles.sql
-- Correctif : la sortie anticipée appelait private.profile_has_role(old.id, …)
-- et profile_has_role(new.id, …). Dans un trigger AFTER UPDATE, les deux relisent
-- la ligne déjà mise à jour → un profil qui DEVIENT membre par UPDATE n'activait
-- jamais sa demande invited. On applique maintenant la même normalisation
-- (private.profile_roles_array) aux valeurs OLD / NEW de la ligne.
-- Conserve 0114 : rattachement sur l'email du compte Auth.

create or replace function public.link_member_application_on_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email      text;
  v_new_member boolean;
  v_old_member boolean;
begin
  v_new_member := coalesce(
    'member' = any (private.profile_roles_array(new.role, new.roles)), false);

  -- Profil déjà membre avant et après : rien à faire
  if tg_op = 'UPDATE' then
    v_old_member := coalesce(
      'member' = any (private.profile_roles_array(old.role, old.roles)), false);
    if v_old_member and v_new_member then
      return new;
    end if;
  end if;

  if not v_new_member then
    return new;
  end if;

  select u.email
    into v_email
  from auth.users u
  where u.id = new.id;

  -- Seules les candidatures acceptées par l'admin (invited) sont activées
  if v_email is not null then
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