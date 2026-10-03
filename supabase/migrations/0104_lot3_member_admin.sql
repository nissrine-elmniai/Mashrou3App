-- 0104_lot3_member_admin.sql
-- a. profiles_guard_role : un non-admin ne peut plus changer account_status
--    (UPDATE). Recopie de 0101 (auth.role()) + restauration de old.account_status.
-- b. inscriptions_delete_superviseur : NON supprimée.
--    Le superviseur retire encore un membre via removeMemberFromSeance
--    (MemberProfileScreen, corbeille si seanceId). L'admin supprime via
--    inscriptions_admin_all. Ne pas drop la policy tant que ce flux existe.
-- c. notify_inscription_sans_affectation : seulement une inscription acceptée
--    compte comme une affectation ; le tap ouvre la fiche membre admin.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

create or replace function private.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Hors requête API (SQL Editor, cron, jobs) ou service_role : non concerné
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if private.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role  := 'member';
    new.roles := array['member']::text[];
    return new;
  end if;

  new.role  := old.role;
  new.roles := old.roles;
  new.account_status := old.account_status;
  return new;
end;
$function$;

create or replace function private.notify_inscription_sans_affectation()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_admin_id uuid;
  v_name text;
begin
  if new.user_id is null then
    return new;
  end if;

  -- auto_affectation a déjà tourné : s'il n'y a toujours pas d'inscription
  -- acceptée pour ce membre (séance demandée ou saison), prévenir les admins.
  if exists (
    select 1
    from public.inscriptions i
    where i.membre_id = new.user_id
      and i.statut = 'accepte'
      and (
        i.seance_id = new.seance_id
        or i.saison_id = btrim(coalesce(new.season_id, ''))
      )
  ) then
    return new;
  end if;

  v_name := coalesce(
    nullif(trim(new.full_name), ''),
    nullif(
      trim(both from concat_ws(' ', new.first_name, new.last_name)),
      ''
    ),
    'مترشح'
  );

  for v_admin_id in
    select p.id
    from public.profiles p
    where (p.role = 'admin' or 'admin' = any (p.roles))
      and p.account_status = 'active'
  loop
    begin
      insert into public.notifications (
        user_id,
        category,
        event_type,
        title,
        body,
        payload,
        source_table,
        source_id
      )
      values (
        v_admin_id,
        'inscriptions',
        'inscription_sans_affectation',
        'تفعيل بدون حصة',
        format(
          'تم تفعيل %s دون تعيين حصة — يلزم التدخل اليدوي.',
          v_name
        ),
        jsonb_build_object(
          'screen', 'MemberProfile',
          'application_id', new.id,
          'kind', new.kind,
          'params', jsonb_build_object(
            'memberId', new.user_id,
            'viewerRole', 'admin'
          ),
          'event_type', 'inscription_sans_affectation'
        ),
        'member_applications',
        new.id
      );
    exception
      when unique_violation then
        null;
      when others then
        raise notice 'notify_inscription_sans_affectation: %', SQLERRM;
    end;
  end loop;

  return new;
end;
$$;
