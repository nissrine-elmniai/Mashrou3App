-- 0089_seance_superviseur_swap.sql
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
      and s.saison_id is distinct from v_a_saison
      and s.statut <> 'archivee'::public.seance_statut_enum
  ) then
    raise exception 'SUPERVISEUR_AUTRE_SAISON' using errcode = 'P0001';
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
