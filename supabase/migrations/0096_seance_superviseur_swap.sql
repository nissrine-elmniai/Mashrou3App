-- 0096_seance_superviseur_swap.sql
-- Permutation du superviseur entre deux séances de la même saison.
--
-- Schéma live (SQL Editor, 2026-10-01) :
--   UNIQUE (saison_id, superviseur_id)  nom : seances_saison_id_superviseur_id_key
--   condeferrable = false à l'origine
--   superviseur_id uuid NOT NULL
--   saison_id text NOT NULL
--   statut seance_statut_enum NOT NULL
--
-- superviseur_id n'est pas nullable : on ne peut pas vider les deux lignes
-- pour respecter l'unicité. La même contrainte est recréée
-- DEFERRABLE INITIALLY DEFERRED. Le contrôle a lieu au COMMIT.
-- La portée reste (saison_id, superviseur_id). Aucun élargissement global.
--
-- Postgres ne permet pas de passer une UNIQUE existante en DEFERRABLE
-- par ALTER CONSTRAINT. DROP + ADD dans la même transaction.
-- Si la contrainte est déjà différée (ALTER déjà collé dans le SQL Editor),
-- le bloc ne la recrée pas.
--
-- La fonction ne modifie pas une séance archivée, ni une séance d'une
-- autre saison. Une séance archivée d'une autre saison ne bloque pas :
-- l'unicité est par saison, et cette ligne ne doit pas être réécrite.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

begin;

do $$
declare
  v_deferrable boolean;
  v_deferred boolean;
begin
  select c.condeferrable, c.condeferred
    into v_deferrable, v_deferred
  from pg_constraint c
  where c.conrelid = 'public.seances'::regclass
    and c.conname = 'seances_saison_id_superviseur_id_key'
    and c.contype = 'u';

  if not found then
    raise exception
      'contrainte seances_saison_id_superviseur_id_key absente sur public.seances';
  end if;

  if v_deferrable and v_deferred then
    raise notice 'seances_saison_id_superviseur_id_key déjà DEFERRABLE INITIALLY DEFERRED';
    return;
  end if;

  alter table public.seances
    drop constraint seances_saison_id_superviseur_id_key;

  alter table public.seances
    add constraint seances_saison_id_superviseur_id_key
    unique (saison_id, superviseur_id)
    deferrable initially deferred;
end $$;

create or replace function public.assign_or_swap_seance_superviseur(
  p_seance_id uuid,
  p_superviseur_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a_id uuid;
  v_a_saison text;
  v_a_statut public.seance_statut_enum;
  v_a_superviseur uuid;
  v_b_id uuid;
  v_b_nom text;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_REQUIS' using errcode = '42501';
  end if;

  if p_seance_id is null or p_superviseur_id is null then
    raise exception 'PARAMETRE_MANQUANT' using errcode = 'P0001';
  end if;

  -- Doublon temporaire autorisé jusqu'au commit de cette transaction.
  set constraints seances_saison_id_superviseur_id_key deferred;

  select s.id, s.saison_id, s.statut, s.superviseur_id
    into v_a_id, v_a_saison, v_a_statut, v_a_superviseur
  from public.seances s
  where s.id = p_seance_id;

  if v_a_id is null then
    raise exception 'SEANCE_INTROUVABLE' using errcode = 'P0001';
  end if;

  if v_a_statut = 'archivee'::public.seance_statut_enum then
    raise exception 'SEANCE_ARCHIVEE' using errcode = 'P0001';
  end if;

  if v_a_superviseur is not distinct from p_superviseur_id then
    return jsonb_build_object(
      'action', 'none',
      'other_seance_id', null,
      'other_seance_nom', null
    );
  end if;

  -- A et toutes les séances qui portent déjà ce superviseur, dans un ordre stable.
  perform 1
  from public.seances s
  where s.id = p_seance_id
     or s.superviseur_id = p_superviseur_id
  order by s.id
  for update;

  select s.id, s.saison_id, s.statut, s.superviseur_id
    into v_a_id, v_a_saison, v_a_statut, v_a_superviseur
  from public.seances s
  where s.id = p_seance_id;

  if v_a_id is null then
    raise exception 'SEANCE_INTROUVABLE' using errcode = 'P0001';
  end if;

  if v_a_statut = 'archivee'::public.seance_statut_enum then
    raise exception 'SEANCE_ARCHIVEE' using errcode = 'P0001';
  end if;

  if v_a_superviseur is not distinct from p_superviseur_id then
    return jsonb_build_object(
      'action', 'none',
      'other_seance_id', null,
      'other_seance_nom', null
    );
  end if;

  if exists (
    select 1
    from public.seances s
    where s.superviseur_id = p_superviseur_id
      and s.id <> p_seance_id
      and s.saison_id = v_a_saison
      and s.statut = 'archivee'::public.seance_statut_enum
  ) then
    raise exception 'SEANCE_ARCHIVEE' using errcode = 'P0001';
  end if;

  select s.id, coalesce(nullif(trim(s.nom), ''), 'الحصة')
    into v_b_id, v_b_nom
  from public.seances s
  where s.superviseur_id = p_superviseur_id
    and s.id <> p_seance_id
    and s.saison_id = v_a_saison
    and s.statut <> 'archivee'::public.seance_statut_enum
  order by s.id
  limit 1;

  if v_b_id is not null then
    update public.seances
    set superviseur_id = p_superviseur_id,
        updated_at = now()
    where id = v_a_id;

    update public.seances
    set superviseur_id = v_a_superviseur,
        updated_at = now()
    where id = v_b_id;

    return jsonb_build_object(
      'action', 'swap',
      'other_seance_id', v_b_id,
      'other_seance_nom', v_b_nom
    );
  end if;

  update public.seances
  set superviseur_id = p_superviseur_id,
      updated_at = now()
  where id = v_a_id;

  return jsonb_build_object(
    'action', 'assign',
    'other_seance_id', null,
    'other_seance_nom', null
  );
end;
$$;

revoke all on function public.assign_or_swap_seance_superviseur(uuid, uuid) from public;
grant execute on function public.assign_or_swap_seance_superviseur(uuid, uuid) to authenticated;

-- L'application met à jour une seule ligne. Sans ce déclencheur, le COMMIT
-- refuse le doublon (23505) et l'écran affiche « سجل مكرر ».
-- Le déclencheur déplace d'abord l'autre séance de la même saison,
-- dans la même transaction. Les saisons précédentes ne sont pas touchées.
create or replace function public.swap_seance_superviseur_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  if new.superviseur_id is not distinct from old.superviseur_id then
    return new;
  end if;

  if current_setting('mashrou3.seance_supervisor_swap', true) = 'on' then
    return new;
  end if;

  if not private.is_admin() then
    return new;
  end if;

  if new.statut = 'archivee'::public.seance_statut_enum then
    return new;
  end if;

  select s.id
    into v_other
  from public.seances s
  where s.superviseur_id = new.superviseur_id
    and s.id <> new.id
    and s.saison_id is not distinct from new.saison_id
    and s.statut <> 'archivee'::public.seance_statut_enum
  order by s.id
  limit 1
  for update;

  if v_other is null then
    return new;
  end if;

  perform set_config('mashrou3.seance_supervisor_swap', 'on', true);
  set constraints seances_saison_id_superviseur_id_key deferred;

  update public.seances
  set superviseur_id = old.superviseur_id,
      updated_at = now()
  where id = v_other;

  return new;
end;
$$;

revoke all on function public.swap_seance_superviseur_before() from public;

drop trigger if exists seances_swap_superviseur on public.seances;
create trigger seances_swap_superviseur
  before update of superviseur_id on public.seances
  for each row
  execute function public.swap_seance_superviseur_before();

-- Après l'enregistrement : chaque séance dont le superviseur change
-- notifie le nouveau responsable et les membres acceptés de cette séance.
-- Une permutation met à jour deux lignes, donc les deux superviseurs et
-- les membres des deux séances sont prévenus.
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
  v_sup_nom   text;
begin
  v_nom     := coalesce(nullif(trim(new.nom), ''), 'الحصة');
  v_creneau := private.seance_creneau_label(new.jour, new.heure_debut, new.heure_fin);

  select coalesce(
    nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
    nullif(trim(p.email), ''),
    'المشرف'
  )
    into v_sup_nom
  from public.profiles p
  where p.id = new.superviseur_id;

  if new.superviseur_id is distinct from v_actor then
    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        new.superviseur_id, 'seances', 'seance_superviseur_affecte',
        'حصة جديدة تحت إشرافك',
        format('تم إسناد حصة «%s» إليك (%s). هذه الحصة تحت إشرافك الآن.', v_nom, v_creneau),
        jsonb_build_object(
          'event_type', 'seance_superviseur_affecte',
          'seance_id', new.id,
          'seance_nom', v_nom
        ),
        'seances', new.id::text || ':sup_new:' || v_stamp
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'notify_seance_superviseur (nouveau): %', SQLERRM;
    end;
  end if;

  if old.superviseur_id is distinct from v_actor
     and old.superviseur_id is distinct from new.superviseur_id then
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

  for v_membre_id in
    select i.membre_id
    from public.inscriptions i
    where i.seance_id = new.id
      and i.statut = 'accepte'::inscription_statut_enum
      and i.membre_id is not null
  loop
    if v_membre_id is distinct from v_actor
       and v_membre_id is distinct from new.superviseur_id then
      begin
        insert into public.notifications (
          user_id, category, event_type, title, body,
          payload, source_table, source_id
        )
        values (
          v_membre_id, 'seances', 'seance_superviseur_change',
          'تغيير المشرف',
          format('حصة «%s» أصبحت تحت إشراف %s.', v_nom, v_sup_nom),
          jsonb_build_object(
            'event_type', 'seance_superviseur_change',
            'seance_id', new.id,
            'seance_nom', v_nom,
            'superviseur_id', new.superviseur_id
          ),
          'seances', new.id::text || ':sup_chg:' || v_membre_id::text || ':' || v_stamp
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

revoke all on function private.notify_seance_superviseur() from public;
grant execute on function private.notify_seance_superviseur() to postgres, service_role;

drop trigger if exists notify_seances_superviseur on public.seances;
create trigger notify_seances_superviseur
  after update of superviseur_id on public.seances
  for each row
  when (new.superviseur_id is distinct from old.superviseur_id)
  execute function private.notify_seance_superviseur();

notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------------
-- Vérification après exécution (lecture seule)
-- ---------------------------------------------------------------------------
--
-- select c.conname,
--        c.condeferrable,
--        c.condeferred,
--        pg_get_constraintdef(c.oid) as def
-- from pg_constraint c
-- where c.conrelid = 'public.seances'::regclass
--   and c.conname = 'seances_saison_id_superviseur_id_key';
--
-- Attendu : condeferrable = true, condeferred = true,
--           def = UNIQUE (saison_id, superviseur_id) DEFERRABLE INITIALLY DEFERRED
--
-- select p.proname,
--        pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname = 'assign_or_swap_seance_superviseur';
--
-- Attendu : une ligne, args = p_seance_id uuid, p_superviseur_id uuid
