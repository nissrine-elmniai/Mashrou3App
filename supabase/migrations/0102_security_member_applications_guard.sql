-- 0102_security_member_applications_guard.sql
-- UPDATE : un candidat pouvait modifier status / user_id / seance_id de sa candidature.
-- INSERT : un non-admin pouvait rattacher une candidature au user_id d'un autre.
-- Exception conservée : activation par l'invité (invited → activated, user_id = soi).
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

create or replace function private.member_applications_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Hors requête API ou service_role : non concerné
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  -- Appel imbriqué (ex. link_member_application_on_profile à l'activation)
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if private.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- user_id : soi-même uniquement (null pour un invité sans compte)
    if new.user_id is distinct from auth.uid() then
      new.user_id := auth.uid();
    end if;
    new.activated_at := null;
    return new;
  end if;

  -- UPDATE : seule transition autorisée → activation de sa propre invitation
  if old.status = 'invited'
     and new.status = 'activated'
     and new.user_id = auth.uid() then
    new.season_id := old.season_id;
    new.seance_id := old.seance_id;
    new.kind      := old.kind;
    return new;
  end if;

  -- Sinon : colonnes réservées à l'admin restaurées silencieusement
  new.status       := old.status;
  new.user_id      := old.user_id;
  new.season_id    := old.season_id;
  new.seance_id    := old.seance_id;
  new.kind         := old.kind;
  new.activated_at := old.activated_at;
  return new;
end;
$function$;

drop trigger if exists member_applications_guard on public.member_applications;
create trigger member_applications_guard
  before insert or update on public.member_applications
  for each row execute function private.member_applications_guard();
