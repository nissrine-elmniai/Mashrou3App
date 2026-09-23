-- 0081_progression_notifications.sql
-- Lot 5 — Notifications catégorie « progression ».
--
-- Schéma live vérifié (PROGRESS.md est périmé sur ce point) :
--   progression : id, membre_id, saison_id (text, NULLABLE), date (timestamptz),
--                 nb_hizb_completes (smallint 0-60), tumun_courant (smallint 0-8),
--                 notes (text), date_saisie (date, défaut CURRENT_DATE = UTC)
--   objectifs   : membre_id, saison_id, nb_hizb_cible (1-60), nb_hizb_depart,
--                 UNIQUE (membre_id, saison_id)
--   Aucun trigger sur ces deux tables avant ce fichier.
--
-- Cap « 1 notification / membre / jour » : assuré par l'index UNIQUE partiel
-- (user_id, event_type, source_id), PAS par une table de suivi. La première
-- saisie du jour crée la ligne, les suivantes sont rejetées en unique_violation
-- et avalées. Mesuré à l'audit : jusqu'à 27 saisies en 83 minutes pour un
-- même membre.
--
-- Le « jour » est calculé en heure de Casablanca, jamais via date_saisie dont
-- le défaut CURRENT_DATE est en UTC : le jour basculerait à 01h00 heure marocaine.
--
-- Destinations déjà dans ALLOWED_SCREENS (MemberProfile, MemberProgress)
-- → aucune modification du client.

-- ---------------------------------------------------------------------------
-- Helper : le ou les superviseurs d'un membre, via inscriptions acceptées
-- sur des séances actives. Un membre peut être inscrit dans plusieurs séances.
-- ---------------------------------------------------------------------------

create or replace function private.superviseurs_du_membre(p_membre_id uuid)
returns table (superviseur_id uuid, seance_id uuid, saison_id text)
language sql
stable
security definer
set search_path to public
as $$
  select distinct s.superviseur_id, s.id, s.saison_id
  from public.inscriptions i
  join public.seances s on s.id = i.seance_id
  where i.membre_id = p_membre_id
    and i.statut = 'accepte'::inscription_statut_enum
    and s.statut = 'active'::seance_statut_enum;
$$;

revoke all on function private.superviseurs_du_membre(uuid) from public;
grant execute on function private.superviseurs_du_membre(uuid) to postgres, service_role;

-- ===========================================================================
-- 1) Nouvelle saisie de progression → superviseur(s), 1 fois par jour
-- ===========================================================================

create or replace function private.notify_progression_saisie()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_sup         record;
  v_actor       uuid := auth.uid();
  v_jour        text;
  v_member_name text;
begin
  -- Jour local Maroc, pas date_saisie (UTC).
  v_jour := (timezone('Africa/Casablanca', coalesce(new.date, now())))::date::text;

  select coalesce(
           nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
           'عضو'
         )
  into v_member_name
  from public.profiles p
  where p.id = new.membre_id;

  v_member_name := coalesce(v_member_name, 'عضو');

  for v_sup in select * from private.superviseurs_du_membre(new.membre_id)
  loop
    if v_sup.superviseur_id is distinct from v_actor then
      begin
        insert into public.notifications (
          user_id, category, event_type, title, body,
          payload, source_table, source_id
        )
        values (
          v_sup.superviseur_id,
          'progression',
          'progression_saisie',
          'تحديث في التقدّم',
          -- Pas de chiffres : avec le cap, seule la PREMIÈRE saisie du jour
          -- notifie ; une valeur affichée serait périmée dès la suivante.
          format('%s سجّل تقدّمًا جديدًا.', v_member_name),
          jsonb_build_object(
            'screen', 'MemberProfile',
            'memberId', new.membre_id,
            'seanceId', v_sup.seance_id,
            'saisonId', v_sup.saison_id,
            'params', jsonb_build_object(
              'memberId', new.membre_id,
              'seanceId', v_sup.seance_id,
              'saisonId', v_sup.saison_id
            ),
            'event_type', 'progression_saisie'
          ),
          'progression',
          new.membre_id::text || ':' || v_jour
        );
      exception
        -- Attendu, et fréquent : c'est le cap 1/jour qui s'applique.
        when unique_violation then null;
        when others then
          raise notice 'notify_progression_saisie: %', SQLERRM;
      end;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_progression_saisie on public.progression;
create trigger notify_progression_saisie
  after insert on public.progression
  for each row
  execute function private.notify_progression_saisie();

revoke all on function private.notify_progression_saisie() from public;
grant execute on function private.notify_progression_saisie() to postgres, service_role;

-- ===========================================================================
-- 2) Objectif posé ou modifié → superviseur(s)
--    Deux triggers distincts : tg_op n'existe pas dans une clause WHEN de
--    CREATE TRIGGER (évaluée par le moteur SQL, hors contexte de trigger).
--    La fonction n'utilise jamais OLD, elle sert donc les deux sans modification.
-- ===========================================================================

create or replace function private.notify_progression_objectif()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_sup         record;
  v_actor       uuid := auth.uid();
  v_member_name text;
  v_source      text;
begin
  select coalesce(
           nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
           'عضو'
         )
  into v_member_name
  from public.profiles p
  where p.id = new.membre_id;

  v_member_name := coalesce(v_member_name, 'عضو');

  -- La cible fait partie du source_id : une révision d'objectif doit
  -- renotifier, un simple re-enregistrement de la même valeur non.
  v_source := new.membre_id::text || ':' || coalesce(new.saison_id, '-')
              || ':' || new.nb_hizb_cible::text;

  for v_sup in select * from private.superviseurs_du_membre(new.membre_id)
  loop
    if v_sup.superviseur_id is distinct from v_actor then
      begin
        insert into public.notifications (
          user_id, category, event_type, title, body,
          payload, source_table, source_id
        )
        values (
          v_sup.superviseur_id,
          'progression',
          'progression_objectif',
          'هدف جديد',
          format('%s حدّد هدفه بـ %s حزبًا لهذا الموسم.',
                 v_member_name, new.nb_hizb_cible::text),
          jsonb_build_object(
            'screen', 'MemberProfile',
            'memberId', new.membre_id,
            'seanceId', v_sup.seance_id,
            'saisonId', v_sup.saison_id,
            'params', jsonb_build_object(
              'memberId', new.membre_id,
              'seanceId', v_sup.seance_id,
              'saisonId', v_sup.saison_id
            ),
            'event_type', 'progression_objectif'
          ),
          'objectifs',
          v_source
        );
      exception
        when unique_violation then null;
        when others then
          raise notice 'notify_progression_objectif: %', SQLERRM;
      end;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_objectifs_pose   on public.objectifs;
drop trigger if exists notify_objectifs_insert on public.objectifs;
drop trigger if exists notify_objectifs_update on public.objectifs;

create trigger notify_objectifs_insert
  after insert on public.objectifs
  for each row
  execute function private.notify_progression_objectif();

create trigger notify_objectifs_update
  after update of nb_hizb_cible on public.objectifs
  for each row
  when (new.nb_hizb_cible is distinct from old.nb_hizb_cible)
  execute function private.notify_progression_objectif();

revoke all on function private.notify_progression_objectif() from public;
grant execute on function private.notify_progression_objectif() to postgres, service_role;

-- ===========================================================================
-- 3) Relance « pas de saisie depuis 7 jours » → membre
--    Répétée tous les 7 jours, plafonnée à 3 relances (jours 7, 14, 21).
--    Le palier entre dans le source_id : l'index UNIQUE garantit une seule
--    notification par palier, sans table de suivi.
--    Après le 3e palier, plus rien — c'est au superviseur de prendre le relais.
-- ===========================================================================

create or replace function public.check_progression_relances()
returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_rec    record;
  v_jours  integer;
  v_palier integer;
begin
  for v_rec in
    select i.membre_id,
           s.saison_id,
           max(p.date) as derniere_saisie
    from public.inscriptions i
    join public.seances s on s.id = i.seance_id
    -- progression.saison_id est nullable et le client ne le remplit pas
    -- toujours : sans la tolérance au null, ces saisies seraient ignorées
    -- et le membre relancé à tort.
    left join public.progression p
           on p.membre_id = i.membre_id
          and (p.saison_id is null or p.saison_id = s.saison_id)
    where i.statut = 'accepte'::inscription_statut_enum
      and s.statut = 'active'::seance_statut_enum
    group by i.membre_id, s.saison_id
  loop
    -- Jamais aucune saisie : on ne relance pas. Le membre vient peut-être
    -- d'être inscrit ; cette relance-là appartiendrait au lot inscriptions.
    if v_rec.derniere_saisie is null then
      continue;
    end if;

    v_jours  := floor(extract(epoch from (now() - v_rec.derniere_saisie)) / 86400)::int;
    v_palier := floor(v_jours / 7)::int;

    if v_palier < 1 or v_palier > 3 then
      continue;
    end if;

    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        v_rec.membre_id,
        'progression',
        'progression_relance',
        'تذكير بتسجيل التقدّم',
        format('لم تسجّل تقدّمك منذ %s يومًا. سجّل ما أنجزته.', v_jours::text),
        jsonb_build_object(
          'screen', 'MemberProgress',
          'params', jsonb_build_object(),
          'event_type', 'progression_relance'
        ),
        'progression',
        v_rec.membre_id::text || ':' || coalesce(v_rec.saison_id, '-')
          || ':relance:' || v_palier::text
      );
    exception
      -- Ce palier a déjà été notifié.
      when unique_violation then null;
      when others then
        raise notice 'check_progression_relances (%): %', v_rec.membre_id, SQLERRM;
    end;
  end loop;
end;
$$;

revoke all on function public.check_progression_relances() from public;
grant execute on function public.check_progression_relances() to postgres, service_role;

-- Une fois par jour à 09:00 UTC. Hors plage calme dans les deux configurations
-- marocaines (UTC+1 en temps normal, UTC+0 pendant le Ramadan).
select cron.unschedule('progression-relance-check')
where exists (select 1 from cron.job where jobname = 'progression-relance-check');

select cron.schedule(
  'progression-relance-check',
  '0 9 * * *',
  $cron$select public.check_progression_relances();$cron$
);

-- ===========================================================================
-- Vérifications post-collage
-- ===========================================================================
--
-- select tgname, pg_get_triggerdef(oid, true)
-- from pg_trigger
-- where tgrelid in ('public.progression'::regclass, 'public.objectifs'::regclass)
--   and not tgisinternal
-- order by tgrelid::regclass::text, tgname;
--
-- select jobname, schedule, active from cron.job;
--
-- -- Que verrait la relance aujourd'hui, sans rien envoyer ?
-- select i.membre_id, s.saison_id, max(p.date) as derniere_saisie,
--        floor(extract(epoch from (now() - max(p.date))) / 86400)::int as jours
-- from public.inscriptions i
-- join public.seances s on s.id = i.seance_id
-- left join public.progression p
--        on p.membre_id = i.membre_id
--       and (p.saison_id is null or p.saison_id = s.saison_id)
-- where i.statut = 'accepte' and s.statut = 'active'
-- group by 1, 2 order by 4 desc nulls last;
--
-- ---------------------------------------------------------------------------
-- Plan de test
-- ---------------------------------------------------------------------------
-- 1) begin; 3 inserts progression pour le même membre le même jour
--    → UNE seule notification au superviseur (cap par index UNIQUE). rollback;
-- 2) Deux membres différents le même jour → deux notifications distinctes.
-- 3) Membre inscrit dans deux séances actives → un superviseur notifié chacun.
-- 4) Garde auth.uid() : l'auteur d'une saisie ne se notifie jamais lui-même.
-- 5) begin; insert objectifs → « هدف جديد » avec la cible.
--    update nb_hizb_cible → nouvelle notification (cible dans le source_id).
--    update d'une autre colonne → rien (le trigger UPDATE ne surveille
--    que nb_hizb_cible). rollback;
-- 6) begin; select public.check_progression_relances(); lire les lignes
--    progression_relance produites; rollback;  ← le plus utile avant de
--    laisser le cron tourner : montre exactement qui serait relancé aujourd'hui.
-- 7) Relancer la fonction deux fois de suite → la 2e ne produit rien
--    (même palier, index UNIQUE).
-- 8) Membre sans aucune saisie → jamais relancé.
-- ===========================================================================