-- 0079_inscriptions_accord_genre.sql
-- Accord en genre des textes de 0077 (CREATE OR REPLACE des fonctions,
-- les triggers restent en place et pointent sur les nouveaux corps).
--
-- member_applications.genre porte le CHECK 'ذكر' | 'أنثى'.
-- profiles.genre est libre → même repli masculin par sécurité.

-- ---------------------------------------------------------------------------
-- 1) Nouvelle demande → admin(s) : « قدّم / قدّمت », « طلب / طلبت »
-- ---------------------------------------------------------------------------

create or replace function private.notify_inscription_demande()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_admin_id uuid;
  v_name  text;
  v_f     boolean;
  v_title text;
  v_body  text;
begin
  v_name := coalesce(
    nullif(trim(new.full_name), ''),
    nullif(trim(both from concat_ws(' ', new.first_name, new.last_name)), ''),
    'مترشح'
  );

  v_f := (nullif(trim(coalesce(new.genre, '')), '') = 'أنثى');

  if coalesce(new.kind, 'join') = 'season_renewal' then
    v_title := 'طلب تجديد الموسم';
    v_body  := format('%s %s تجديد التسجيل للموسم.',
                      case when v_f then 'طلبت' else 'طلب' end,
                      v_name);
  else
    v_title := 'طلب انضمام جديد';
    v_body  := format('%s %s طلب انضمام.',
                      case when v_f then 'قدّمت' else 'قدّم' end,
                      v_name);
  end if;

  for v_admin_id in
    select p.id
    from public.profiles p
    where (p.role = 'admin' or 'admin' = any (p.roles))
      and p.account_status = 'active'
  loop
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        v_admin_id,
        'inscriptions',
        'inscription_demande',
        v_title,
        v_body,
        jsonb_build_object(
          'screen', 'AdminRegistrations',
          'application_id', new.id,
          'kind', new.kind,
          'params', jsonb_build_object(
            'application_id', new.id,
            'kind', new.kind
          ),
          'event_type', 'inscription_demande'
        ),
        'member_applications',
        new.id
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_inscription_demande: %', SQLERRM;
    end;
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Nouveau membre dans la séance → superviseur : « انضم / انضمت »
-- ---------------------------------------------------------------------------

create or replace function private.notify_inscription_nouveau_membre()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_superviseur uuid;
  v_seance_nom  text;
  v_member_name text;
  v_genre       text;
  v_f           boolean;
begin
  select s.superviseur_id, s.nom
  into v_superviseur, v_seance_nom
  from public.seances s
  where s.id = new.seance_id;

  if v_superviseur is null then
    return new;
  end if;

  -- Le superviseur qui vient d'affecter le membre ne se notifie pas.
  -- auth.uid() est null quand l'INSERT vient d'auto_affecter (contexte serveur).
  if auth.uid() is not distinct from v_superviseur then
    return new;
  end if;

  select coalesce(
           nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
           'عضو'
         ),
         p.genre
  into v_member_name, v_genre
  from public.profiles p
  where p.id = new.membre_id;

  v_member_name := coalesce(v_member_name, 'عضو');
  v_seance_nom  := coalesce(nullif(trim(v_seance_nom), ''), 'الحصة');
  v_f           := (nullif(trim(coalesce(v_genre, '')), '') = 'أنثى');

  begin
    insert into public.notifications (
      user_id, category, event_type, title, body,
      payload, source_table, source_id
    )
    values (
      v_superviseur,
      'inscriptions',
      'inscription_nouveau_membre',
      'عضو جديد في الحصة',
      format('%s %s إلى حصة «%s».',
             case when v_f then 'انضمت' else 'انضم' end,
             v_member_name,
             v_seance_nom),
      jsonb_build_object(
        'screen', 'MemberProfile',
        'memberId', new.membre_id,
        'seanceId', new.seance_id,
        'saisonId', new.saison_id,
        'params', jsonb_build_object(
          'memberId', new.membre_id,
          'seanceId', new.seance_id,
          'saisonId', new.saison_id
        ),
        'event_type', 'inscription_nouveau_membre'
      ),
      'inscriptions',
      new.id::text
    );
  exception
    when unique_violation then null;
    when others then
      raise notice 'notify_inscription_nouveau_membre: %', SQLERRM;
  end;

  return new;
end;
$$;