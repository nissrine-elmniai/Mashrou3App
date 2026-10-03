-- 0103_link_application_invited_only.sql
-- link_member_application_on_profile activait aussi les candidatures 'pending'
-- (non validées par l'admin) à la création d'un compte.
-- Désormais : seules les candidatures 'invited' (acceptées par l'admin) sont activées.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

create or replace function public.link_member_application_on_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Profil déjà membre avant et après : rien à faire
  if tg_op = 'UPDATE'
     and private.profile_has_role(old.id, 'member')
     and private.profile_has_role(new.id, 'member') then
    return new;
  end if;

  -- Seules les candidatures acceptées par l'admin (invited) sont activées
  if private.profile_has_role(new.id, 'member') and new.email is not null then
    update public.member_applications
    set
      status = 'activated',
      user_id = new.id,
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
    where lower(email) = lower(new.email)
      and status = 'invited';
  end if;

  return new;
end;
$function$;
