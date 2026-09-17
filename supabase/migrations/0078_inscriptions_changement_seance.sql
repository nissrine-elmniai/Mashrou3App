-- 0078_inscriptions_changement_seance.sql
-- Lot 2 (complément) — Déplacement d'un membre déjà inscrit vers une autre séance.
--
-- 0077 ne couvrait que l'INSERT dans inscriptions (première affectation).
-- Quand l'admin modifie la séance d'un membre existant, c'est un UPDATE de
-- seance_id : aucun trigger ne se déclenchait, ni le nouveau superviseur ni
-- l'ancien n'étaient prévenus.
--
-- source_id composé « {inscriptions.id}:{seance_id} » : sans le suffixe, un
-- aller-retour séance A → B → A serait rejeté par l'index UNIQUE partiel
-- (user_id, event_type, source_id) et le superviseur A ne verrait rien.
-- Même raison que « {presence_rappels.id}:{nb_rappels_envoyes} » au lot 1.
--
-- Accord en genre : profiles.genre ('أنثى' → forme féminine), repli masculin
-- si null ou valeur inattendue. En arabe le verbe précède le sujet, d'où le
-- verbe passé en premier %s des format().

create or replace function private.notify_inscription_changement_seance()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_sup_new      uuid;
  v_sup_old      uuid;
  v_seance_new   text;
  v_seance_old   text;
  v_member_name  text;
  v_genre        text;
  v_f            boolean;
  v_actor        uuid := auth.uid();
begin
  select s.superviseur_id, coalesce(nullif(trim(s.nom), ''), 'الحصة')
  into v_sup_new, v_seance_new
  from public.seances s
  where s.id = new.seance_id;

  select s.superviseur_id, coalesce(nullif(trim(s.nom), ''), 'الحصة')
  into v_sup_old, v_seance_old
  from public.seances s
  where s.id = old.seance_id;

  select coalesce(
           nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
           'عضو'
         ),
         p.genre
  into v_member_name, v_genre
  from public.profiles p
  where p.id = new.membre_id;

  v_member_name := coalesce(v_member_name, 'عضو');
  v_seance_new  := coalesce(v_seance_new, 'الحصة');
  v_seance_old  := coalesce(v_seance_old, 'الحصة');
  v_f           := (nullif(trim(coalesce(v_genre, '')), '') = 'أنثى');

  -- -------------------------------------------------------------------
  -- a) Nouveau superviseur : « عضو جديد في الحصة »
  --    Même event_type et même intitulé que la notif 4 de 0077.
  -- -------------------------------------------------------------------
  if v_sup_new is not null and v_sup_new is distinct from v_actor then
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        v_sup_new,
        'inscriptions',
        'inscription_nouveau_membre',
        'عضو جديد في الحصة',
        format('%s %s إلى حصة «%s».',
               case when v_f then 'انضمت' else 'انضم' end,
               v_member_name,
               v_seance_new),
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
        new.id::text || ':' || new.seance_id::text
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_changement_seance (nouveau sup): %', SQLERRM;
    end;
  end if;

  -- -------------------------------------------------------------------
  -- b) Ancien superviseur : « مغادرة عضو »
  --    PAS de screen : ses policies RLS sont limitées aux membres de sa
  --    séance, et le membre vient d'en sortir — MemberProfile échouerait.
  --    Repli automatique sur l'écran de détail générique (lot 1.7).
  -- -------------------------------------------------------------------
  if v_sup_old is not null
     and v_sup_old is distinct from v_actor
     and v_sup_old is distinct from v_sup_new then
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        v_sup_old,
        'inscriptions',
        'inscription_depart_membre',
        'مغادرة عضو',
        format('%s %s حصة «%s».',
               case when v_f then 'غادرت' else 'غادر' end,
               v_member_name,
               v_seance_old),
        jsonb_build_object('event_type', 'inscription_depart_membre'),
        'inscriptions',
        new.id::text || ':' || old.seance_id::text
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_changement_seance (ancien sup): %', SQLERRM;
    end;
  end if;

  -- -------------------------------------------------------------------
  -- c) Le membre : son jour et son horaire changent.
  --    Texte à la 2e personne, invariable en genre.
  --    Pas de screen (le dashboard membre est dans NOT_A_DESTINATION).
  -- -------------------------------------------------------------------
  if new.membre_id is distinct from v_actor then
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        new.membre_id,
        'inscriptions',
        'inscription_changement_seance',
        'تغيير الحصة',
        format('تم نقلك إلى حصة «%s».', v_seance_new),
        jsonb_build_object('event_type', 'inscription_changement_seance'),
        'inscriptions',
        new.id::text || ':' || new.seance_id::text
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_changement_seance (membre): %', SQLERRM;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_inscriptions_changement_seance on public.inscriptions;
create trigger notify_inscriptions_changement_seance
  after update of seance_id on public.inscriptions
  for each row
  when (
    new.seance_id is distinct from old.seance_id
    and new.statut = 'accepte'::inscription_statut_enum
  )
  execute function private.notify_inscription_changement_seance();

revoke all on function private.notify_inscription_changement_seance() from public;
grant execute on function private.notify_inscription_changement_seance()
  to postgres, service_role;

-- ===========================================================================
-- Plan de test
-- ---------------------------------------------------------------------------
-- 1) Admin déplace un membre de la séance A vers B
--    → superviseur B : « عضو جديد في الحصة » (tap → MemberProfile)
--    → superviseur A : « مغادرة عضو » (tap → détail générique)
--    → membre        : « تغيير الحصة »  (tap → détail générique)
-- 2) Le superviseur B déplace lui-même le membre
--    → il ne se notifie pas ; A et le membre sont notifiés.
-- 3) B → A → B : chaque étape produit ses notifications (source_id composé).
-- 4) UPDATE de seance_id sur une inscription 'en_attente' → rien (clause WHEN).
-- 5) Membre avec genre 'أنثى' → « انضمت » / « غادرت ».
-- ===========================================================================