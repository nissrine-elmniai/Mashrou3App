-- 0080_seances_notifications.sql
-- Lot 3 — Notifications catégorie « seances ».
--
-- Schéma live vérifié (les migrations du dépôt sont périmées sur ces points) :
--   jour            : enum jour_semaine, NOT NULL
--   statut          : enum seance_statut_enum (active | inactive | archivee)
--   superviseur_id  : uuid NOT NULL, UNIQUE sur (saison_id, superviseur_id)
--   saison_id       : text NOT NULL
--   heure_debut/fin : time NULLABLE  → tout texte doit gérer l'absence d'horaire
--   aucun trigger updated_at : la détection passe par les clauses WHEN
--
-- Destinations : aucune route viable (AdminSeanceDetail hors ALLOWED_SCREENS,
-- dashboards dans NOT_A_DESTINATION, pas d'écran « ma séance » côté membre).
-- Toutes les notifications de ce lot tombent donc sur l'écran de détail
-- générique du lot 1.7 — aucun payload.screen, aucune modification du client.
--
-- source_id suffixé d'un horodatage : un aller-retour (superviseur A → B → A,
-- ou un créneau remis comme avant) doit pouvoir renotifier. Sans le suffixe,
-- l'index UNIQUE partiel (user_id, event_type, source_id) rejetterait le
-- second passage en silence. Même raison qu'au lot 1 avec nb_rappels_envoyes.
--
-- Textes à la 2e personne ou impersonnels : invariables en genre.
-- profiles.genre est renseigné pour 6 profils sur 16, l'accord produirait plus
-- de fautes qu'il n'en corrigerait.

-- ---------------------------------------------------------------------------
-- Helper : libellé lisible du créneau, robuste aux horaires null
-- ---------------------------------------------------------------------------

create or replace function private.seance_creneau_label(
  p_jour        jour_semaine,
  p_heure_debut time,
  p_heure_fin   time
)
returns text
language sql
immutable
as $$
  select case
    when p_heure_debut is null and p_heure_fin is null then
      p_jour::text
    when p_heure_fin is null then
      p_jour::text || ' ' || to_char(p_heure_debut, 'HH24:MI')
    when p_heure_debut is null then
      p_jour::text || ' ' || to_char(p_heure_fin, 'HH24:MI')
    else
      p_jour::text || ' ' || to_char(p_heure_debut, 'HH24:MI')
        || ' - ' || to_char(p_heure_fin, 'HH24:MI')
  end;
$$;

-- ===========================================================================
-- 1) Planning modifié (jour / heure_debut / heure_fin)
--    → inscrits 'accepte' + superviseur
-- ===========================================================================

create or replace function private.notify_seance_planning()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_membre_id   uuid;
  v_actor       uuid := auth.uid();
  v_stamp       text := extract(epoch from clock_timestamp())::bigint::text;
  v_creneau     text;
  v_nom         text;
  v_body        text;
  v_source      text;
begin
  v_nom     := coalesce(nullif(trim(new.nom), ''), 'الحصة');
  v_creneau := private.seance_creneau_label(new.jour, new.heure_debut, new.heure_fin);
  v_body    := format('الموعد الجديد لحصة «%s» هو %s.', v_nom, v_creneau);
  v_source  := new.id::text || ':planning:' || v_stamp;

  -- a) Les membres inscrits et acceptés
  for v_membre_id in
    select i.membre_id
    from public.inscriptions i
    where i.seance_id = new.id
      and i.statut = 'accepte'::inscription_statut_enum
  loop
    if v_membre_id is distinct from v_actor then
      begin
        insert into public.notifications (
          user_id, category, event_type, title, body,
          payload, source_table, source_id
        )
        values (
          v_membre_id, 'seances', 'seance_planning_modifie',
          'تغيير في موعد الحصة', v_body,
          jsonb_build_object('event_type', 'seance_planning_modifie'),
          'seances', v_source
        );
      exception
        when unique_violation then null;
        when others then
          raise notice 'notify_seance_planning (membre): %', SQLERRM;
      end;
    end if;
  end loop;

  -- b) Le superviseur (NOT NULL en base, pas de garde de nullité nécessaire)
  if new.superviseur_id is distinct from v_actor then
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        new.superviseur_id, 'seances', 'seance_planning_modifie',
        'تغيير في موعد الحصة', v_body,
        jsonb_build_object('event_type', 'seance_planning_modifie'),
        'seances', v_source
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_seance_planning (superviseur): %', SQLERRM;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_seances_planning on public.seances;
create trigger notify_seances_planning
  after update of jour, heure_debut, heure_fin on public.seances
  for each row
  when (
    new.statut = 'active'::seance_statut_enum
    and (
      new.jour        is distinct from old.jour
      or new.heure_debut is distinct from old.heure_debut
      or new.heure_fin   is distinct from old.heure_fin
    )
  )
  execute function private.notify_seance_planning();

revoke all on function private.notify_seance_planning() from public;
grant execute on function private.notify_seance_planning() to postgres, service_role;

-- ===========================================================================
-- 2) Changement de superviseur → nouveau, ancien, et les membres
-- ===========================================================================

create or replace function private.notify_seance_superviseur()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_membre_id uuid;
  v_actor     uuid := auth.uid();
  v_stamp     text := extract(epoch from clock_timestamp())::bigint::text;
  v_nom       text;
  v_creneau   text;
begin
  v_nom     := coalesce(nullif(trim(new.nom), ''), 'الحصة');
  v_creneau := private.seance_creneau_label(new.jour, new.heure_debut, new.heure_fin);

  -- a) Nouveau superviseur — tournure impersonnelle (pas de « مشرفًا/مشرفة »)
  if new.superviseur_id is distinct from v_actor then
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        new.superviseur_id, 'seances', 'seance_superviseur_affecte',
        'حصة جديدة تحت إشرافك',
        format('تم إسناد حصة «%s» إليك (%s).', v_nom, v_creneau),
        jsonb_build_object('event_type', 'seance_superviseur_affecte'),
        'seances', new.id::text || ':sup_new:' || v_stamp
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_seance_superviseur (nouveau): %', SQLERRM;
    end;
  end if;

  -- b) Ancien superviseur
  if old.superviseur_id is distinct from v_actor then
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        old.superviseur_id, 'seances', 'seance_superviseur_retire',
        'إنهاء الإشراف',
        format('لم تعد حصة «%s» تحت إشرافك.', v_nom),
        jsonb_build_object('event_type', 'seance_superviseur_retire'),
        'seances', new.id::text || ':sup_old:' || v_stamp
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_seance_superviseur (ancien): %', SQLERRM;
    end;
  end if;

  -- c) Les membres : ils changent d'encadrant
  for v_membre_id in
    select i.membre_id
    from public.inscriptions i
    where i.seance_id = new.id
      and i.statut = 'accepte'::inscription_statut_enum
  loop
    if v_membre_id is distinct from v_actor then
      begin
        insert into public.notifications (
          user_id, category, event_type, title, body,
          payload, source_table, source_id
        )
        values (
          v_membre_id, 'seances', 'seance_superviseur_change',
          'تغيير المشرف',
          format('تم تغيير المشرف على حصة «%s».', v_nom),
          jsonb_build_object('event_type', 'seance_superviseur_change'),
          'seances', new.id::text || ':sup_chg:' || v_stamp
        );
      exception
        when unique_violation then null;
        when others then
          raise notice 'notify_seance_superviseur (membre): %', SQLERRM;
      end;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_seances_superviseur on public.seances;
create trigger notify_seances_superviseur
  after update of superviseur_id on public.seances
  for each row
  when (new.superviseur_id is distinct from old.superviseur_id)
  execute function private.notify_seance_superviseur();

revoke all on function private.notify_seance_superviseur() from public;
grant execute on function private.notify_seance_superviseur() to postgres, service_role;

-- ===========================================================================
-- 3) Archivage de la séance (fin de musim) → membres + superviseur
--    Cible 'archivee' explicitement : 'inactive' est un troisième statut
--    distinct, absent des deux documents de conception.
-- ===========================================================================

create or replace function private.notify_seance_archivee()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_membre_id uuid;
  v_actor     uuid := auth.uid();
  v_stamp     text := extract(epoch from clock_timestamp())::bigint::text;
  v_nom       text;
begin
  v_nom := coalesce(nullif(trim(new.nom), ''), 'الحصة');

  -- a) Les membres inscrits
  for v_membre_id in
    select i.membre_id
    from public.inscriptions i
    where i.seance_id = new.id
      and i.statut = 'accepte'::inscription_statut_enum
  loop
    if v_membre_id is distinct from v_actor then
      begin
        insert into public.notifications (
          user_id, category, event_type, title, body,
          payload, source_table, source_id
        )
        values (
          v_membre_id, 'seances', 'seance_archivee_membre',
          'انتهاء الموسم',
          format('تم إنهاء حصة «%s». نشكرك على مواظبتك.', v_nom),
          jsonb_build_object('event_type', 'seance_archivee_membre'),
          'seances', new.id::text || ':arch:' || v_stamp
        );
      exception
        when unique_violation then null;
        when others then
          raise notice 'notify_seance_archivee (membre): %', SQLERRM;
      end;
    end if;
  end loop;

  -- b) Le superviseur
  if new.superviseur_id is distinct from v_actor then
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        new.superviseur_id, 'seances', 'seance_archivee_superviseur',
        'أرشفة الحصة',
        format('تمت أرشفة حصة «%s» مع نهاية الموسم.', v_nom),
        jsonb_build_object('event_type', 'seance_archivee_superviseur'),
        'seances', new.id::text || ':arch_sup:' || v_stamp
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_seance_archivee (superviseur): %', SQLERRM;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_seances_archivee on public.seances;
create trigger notify_seances_archivee
  after update of statut on public.seances
  for each row
  when (
    new.statut = 'archivee'::seance_statut_enum
    and old.statut is distinct from 'archivee'::seance_statut_enum
  )
  execute function private.notify_seance_archivee();

revoke all on function private.notify_seance_archivee() from public;
grant execute on function private.notify_seance_archivee() to postgres, service_role;

revoke all on function private.seance_creneau_label(jour_semaine, time, time) from public;
grant execute on function private.seance_creneau_label(jour_semaine, time, time)
  to postgres, service_role;

-- ===========================================================================
-- Vérifications post-collage
-- ===========================================================================
--
-- select tgname, pg_get_triggerdef(oid, true)
-- from pg_trigger
-- where tgrelid = 'public.seances'::regclass and not tgisinternal
-- order by tgname;
--
-- select category, event_type, count(*)
-- from public.notifications group by 1, 2 order by 1, 2;
--
-- ---------------------------------------------------------------------------
-- Plan de test
-- ---------------------------------------------------------------------------
-- 1) Admin change le jour d'une séance active
--    → chaque inscrit 'accepte' + le superviseur : « تغيير في موعد الحصة »,
--      avec le créneau complet dans le corps.
-- 2) Admin change seulement heure_fin
--    → même notification (la clause WHEN couvre les trois colonnes).
-- 3) Séance dont heure_debut et heure_fin sont null
--    → le corps affiche le jour seul, sans horaire tronqué.
-- 4) Admin change le superviseur d'une séance
--    → nouveau : « حصة جديدة تحت إشرافك »
--    → ancien  : « إنهاء الإشراف »
--    → membres : « تغيير المشرف »
-- 5) A → B → A : chaque étape renotifie (suffixe horodaté du source_id).
-- 6) Fin de musim (startNewSeason → archiveSeancesForSaisonIds)
--    → une notification par membre et une au superviseur, PAR séance archivée.
--    Vérifier le volume avant de lancer en réel.
-- 7) Séance passée en 'inactive' → aucune notification (le trigger vise
--    'archivee' uniquement).
-- 8) Modification du planning d'une séance déjà archivée → rien.
-- ===========================================================================