-- 0135_progression_depart_calcule.sql
-- Le point de départ de la saison n'est plus stocké : il est calculé ici.
--
-- Problème corrigé : objectifs.nb_hizb_depart (0062) était figé à la création
-- de l'objectif. Sans ligne progression à ce moment, il valait 0, et toute la
-- position comptait comme gain (anneau à 100 %, objectif_atteint faux,
-- realisationMoyennePct gonflée).
--
-- Colonnes lues (vérifiées dans le dépôt) :
--   progression : membre_id, saison_id text (0041), date timestamptz,
--                 nb_hizb_completes, tumun_courant (0087, 0108). Le CREATE de
--                 0004 ne correspond pas au schéma live (voir 0041).
--   objectifs   : membre_id, saison_id, nb_hizb_cible 1–60 (0057).
--                 nb_hizb_depart (0062) n'est plus lu ; la colonne reste
--                 (défaut 0) et sera supprimée plus tard.
--   saisons     : id text, start_date date (0042, nullable), active (0118 : une
--                 seule saison active, tous types).
--   inscriptions: membre_id, saison_id text, seance_id, statut.
--   seances     : id, superviseur_id.
--
-- Unités : toutes les positions sont en أثمان, 0 à 480
-- (private.progression_tumun, 0123 : hizb × 8 + tumun_courant).
--
-- Règles :
--   P = dernière ligne progression du membre, toutes saisons (date desc, id desc).
--   D = minimum entre la dernière position avant le début de la saison
--       (date < start_date à 00:00 Africa/Casablanca) et toutes les lignes
--       de la saison (saison_id = S). Aucune ligne → NULL.
--       start_date NULL : seule la partie « lignes de la saison » compte.
--   G = P − D, C = nb_hizb_cible × 8.
--   avancement = least(100, 100 × G / C) ; D NULL ou pas d'objectif → NULL.
--   fin visée = least(480, D + C).
--
-- season_member_stats.objectif_depart (smallint) est en حزب depuis 0122/0123.
-- L'unité est conservée : on y écrit floor(D / 8). objectif_atteint et
-- realisationMoyennePct utilisent D exact en أثمان (pos_debut), pas cette
-- colonne arrondie.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Prérequis : 0123 (private.progression_tumun), 0127 (grant member_stats).

-- ---------------------------------------------------------------------------
-- a. Départ de la saison, en أثمان.
-- ---------------------------------------------------------------------------

create or replace function private.season_start_tumun(
  p_membre_id uuid,
  p_saison_id text
)
returns integer
language sql
stable
set search_path = ''
as $$
  select min(s.pos)::integer
  from (
    (
      -- Dernière position avant le début de la saison.
      select private.progression_tumun(p.nb_hizb_completes, p.tumun_courant)::integer as pos
      from public.progression p
      join public.saisons z on z.id = p_saison_id
      where p.membre_id = p_membre_id
        and z.start_date is not null
        and p.nb_hizb_completes is not null
        and p.date < (z.start_date::timestamp at time zone 'Africa/Casablanca')
      order by p.date desc, p.id desc
      limit 1
    )
    union all
    -- Toutes les lignes de la saison (une correction à la baisse abaisse D).
    select private.progression_tumun(p.nb_hizb_completes, p.tumun_courant)::integer
    from public.progression p
    where p.membre_id = p_membre_id
      and p.saison_id = p_saison_id
  ) s;
$$;

-- ---------------------------------------------------------------------------
-- b. Avancement d'un membre dans une saison.
-- ---------------------------------------------------------------------------

create or replace function private.member_season_progress(
  p_membre_id uuid,
  p_saison_id text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_pos integer;
  v_dep integer;
  v_cible integer;
  v_gain integer;
  v_pct numeric;
  v_fin integer;
  v_etat text;
begin
  select private.progression_tumun(p.nb_hizb_completes, p.tumun_courant)::integer
    into v_pos
  from public.progression p
  where p.membre_id = p_membre_id
  order by p.date desc, p.id desc
  limit 1;

  v_dep := private.season_start_tumun(p_membre_id, p_saison_id);

  select o.nb_hizb_cible::integer * 8
    into v_cible
  from public.objectifs o
  where o.membre_id = p_membre_id
    and o.saison_id = p_saison_id;

  if v_pos is not null and v_dep is not null then
    -- P ≥ D dès que P est une ligne de la saison. Seule une ligne postérieure
    -- hors saison (saison_id null ou autre) pourrait être plus basse : 0.
    v_gain := greatest(0, v_pos - v_dep);
    v_fin := case when v_cible is null then null else least(480, v_dep + v_cible) end;
  end if;

  if v_gain is not null and v_cible is not null and v_cible > 0 then
    v_pct := round(least(100, 100.0 * v_gain / v_cible), 1);
  end if;

  v_etat := case
    when v_pos is null or v_dep is null then 'sans_position'
    when v_cible is null then 'sans_objectif'
    else 'ok'
  end;

  return jsonb_build_object(
    'position', v_pos,
    'depart', v_dep,
    'gain', v_gain,
    'cible', v_cible,
    'avancement_pct', v_pct,
    'fin_visee', v_fin,
    'etat', v_etat
  );
end;
$$;

revoke all on function private.season_start_tumun(uuid, text) from public, anon, authenticated;
revoke all on function private.member_season_progress(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- c. RPC client : saison active.
-- ---------------------------------------------------------------------------

create or replace function public.get_member_season_progress(p_membre_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_saison text;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول';
  end if;

  if p_membre_id is null then
    raise exception 'معرّف العضو مفقود';
  end if;

  select z.id
    into v_saison
  from public.saisons z
  where z.active
  limit 1;

  if not (
    p_membre_id = v_uid
    or private.is_admin()
    or (
      v_saison is not null
      and exists (
        select 1
        from public.inscriptions i
        join public.seances s on s.id = i.seance_id
        where i.membre_id = p_membre_id
          and i.saison_id = v_saison
          and i.statut::text = 'accepte'
          and s.superviseur_id = v_uid
      )
    )
  ) then
    raise exception 'لا صلاحية كافية لهذه العملية';
  end if;

  -- Aucune saison active : rien à calculer.
  if v_saison is null then
    return null;
  end if;

  return private.member_season_progress(p_membre_id, v_saison)
    || jsonb_build_object('saison_id', v_saison);
end;
$$;

revoke all on function public.get_member_season_progress(uuid) from public, anon;
grant execute on function public.get_member_season_progress(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- d. Statistiques : seul le départ change (dernière version : 0123, grant 0127).
--    pos_debut = D ; objectif_depart = floor(D / 8) (حزب) ;
--    objectif_atteint = (pos_fin − D) ≥ C, NULL si D NULL.
-- ---------------------------------------------------------------------------

create or replace function public.compute_season_member_stats(p_saison_id text)
returns setof public.season_member_stats
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_admin() then
    raise exception 'هذه العملية للمشرف العام فقط';
  end if;

  if p_saison_id is null or btrim(p_saison_id) = '' then
    return;
  end if;

  return query
  with accepted as (
    -- inscriptions_membre_id_saison_id_key : une ligne, donc une séance.
    select
      i.membre_id,
      i.seance_id,
      i.statut::text as statut_inscription
    from public.inscriptions i
    where i.statut::text = 'accepte'
      and i.saison_id = p_saison_id
  ),
  seance_info as (
    select
      a.membre_id,
      a.seance_id,
      a.statut_inscription,
      s.nom as seance_nom,
      s.superviseur_id,
      nullif(btrim(s.genre), '') as seance_genre,
      nullif(
        btrim(concat_ws(' ', sup.first_name, sup.last_name)),
        ''
      ) as superviseur_nom
    from accepted a
    left join public.seances s on s.id = a.seance_id
    left join public.profiles sup on sup.id = s.superviseur_id
  ),
  genre_app as (
    select distinct on (app.user_id)
      app.user_id,
      nullif(btrim(app.genre), '') as genre
    from public.member_applications app
    join accepted a on a.membre_id = app.user_id
    where app.season_id = p_saison_id
      and nullif(btrim(app.genre), '') is not null
    order by app.user_id, app.updated_at desc nulls last, app.created_at desc nulls last
  ),
  kind_app as (
    select distinct on (app.user_id)
      app.user_id,
      app.kind
    from public.member_applications app
    join accepted a on a.membre_id = app.user_id
    where app.season_id = p_saison_id
    order by app.user_id, app.updated_at desc nulls last, app.created_at desc nulls last
  ),
  pres as (
    -- Même séance que l'inscription unique (contrainte ci-dessus).
    select
      pr.membre_id,
      count(*) filter (where pr.statut::text = 'present')::integer as present,
      count(*) filter (where pr.statut::text = 'absent')::integer as absent
    from public.presences pr
    join accepted a
      on a.membre_id = pr.membre_id
     and a.seance_id = pr.seance_id
    where pr.statut::text in ('present', 'absent')
    group by pr.membre_id
  ),
  fin as (
    -- Position courante : dernière ligne, toutes saisons, date desc, id desc.
    select distinct on (p.membre_id)
      p.membre_id,
      private.progression_tumun(p.nb_hizb_completes, p.tumun_courant) as pos
    from public.progression p
    join accepted a on a.membre_id = p.membre_id
    order by p.membre_id, p.date desc, p.id desc
  ),
  depart as (
    -- D : même règle que l'écran membre (0135).
    select
      a.membre_id,
      private.season_start_tumun(a.membre_id, p_saison_id)::smallint as pos
    from accepted a
  ),
  inv as (
    select
      ti.membre_id,
      count(*)::integer as invites,
      count(*) filter (
        where ti.statut::text = 'note' and ti.note is not null
      )::integer as notes,
      round(
        avg(ti.note) filter (
          where ti.statut::text = 'note' and ti.note is not null
        ),
        2
      ) as moyenne
    from public.test_invitations ti
    join public.tests t on t.id = ti.test_id
    join accepted a on a.membre_id = ti.membre_id
    where t.saison_id = p_saison_id
    group by ti.membre_id
  ),
  obj as (
    select
      o.membre_id,
      o.nb_hizb_cible::smallint as cible
    from public.objectifs o
    join accepted a on a.membre_id = o.membre_id
    where o.saison_id = p_saison_id
  ),
  base as (
    select
      si.membre_id,
      si.seance_id,
      si.seance_nom,
      si.superviseur_id,
      si.superviseur_nom,
      coalesce(si.seance_genre, ga.genre) as genre,
      ka.kind as type_demande,
      si.statut_inscription,
      coalesce(pr.present, 0) as present,
      coalesce(pr.absent, 0) as absent,
      fin.pos as pos_fin,
      dep.pos as pos_debut,
      coalesce(iv.invites, 0) as invites,
      coalesce(iv.notes, 0) as notes,
      iv.moyenne as note_moyenne,
      o.cible as objectif_cible,
      o.membre_id as objectif_membre
    from seance_info si
    left join genre_app ga on ga.user_id = si.membre_id
    left join kind_app ka on ka.user_id = si.membre_id
    left join pres pr on pr.membre_id = si.membre_id
    left join fin on fin.membre_id = si.membre_id
    left join depart dep on dep.membre_id = si.membre_id
    left join inv iv on iv.membre_id = si.membre_id
    left join obj o on o.membre_id = si.membre_id
  )
  select
    p_saison_id,
    b.membre_id,
    b.seance_id,
    b.seance_nom,
    b.superviseur_id,
    b.superviseur_nom,
    b.genre,
    b.type_demande,
    b.statut_inscription,
    b.present,
    b.absent,
    case
      when b.present + b.absent = 0 then null::numeric
      else round(100.0 * b.present / (b.present + b.absent))
    end,
    b.pos_debut,
    b.pos_fin,
    case
      when b.pos_debut is not null and b.pos_fin is not null
        then (b.pos_fin - b.pos_debut)::smallint
      else null
    end,
    b.invites,
    b.notes,
    b.note_moyenne,
    b.objectif_cible,
    -- Colonne en حزب (0122/0123) : حزب complets au départ.
    case
      when b.objectif_membre is null or b.pos_debut is null then null::smallint
      else (b.pos_debut / 8)::smallint
    end,
    case
      when b.objectif_membre is null then null::boolean
      when b.pos_debut is null or b.pos_fin is null then null::boolean
      else (b.pos_fin - b.pos_debut)::integer >= (b.objectif_cible::integer * 8)
    end,
    'snapshot'::text,
    now()
  from base b;
end;
$$;

create or replace function public.compute_season_stats(p_saison_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id text;
  v_saison public.saisons%rowtype;
  v_rows public.season_member_stats[];
  v_membres integer := 0;
  v_male integer := 0;
  v_female integer := 0;
  v_join integer := 0;
  v_renew integer := 0;
  v_present integer := 0;
  v_absent integer := 0;
  v_ge90 integer := 0;
  v_p75 integer := 0;
  v_p50 integer := 0;
  v_lt50 integer := 0;
  v_sans integer := 0;
  v_avg_pos numeric;
  v_avec integer := 0;
  v_gain_moy numeric;
  v_gain_tot numeric;
  v_khatm integer := 0;
  v_tranches jsonb;
  v_fixes integer := 0;
  v_atteints integer := 0;
  v_real numeric;
  v_timeline jsonb;
  v_par_mois jsonb;
  v_by_seance jsonb;
  v_by_sup jsonb;
  v_tests_count integer := 0;
  v_tests_invites integer := 0;
  v_tests_notes integer := 0;
  v_tests_moy numeric;
  v_tests_min numeric;
  v_tests_max numeric;
  v_tests_dist jsonb;
  v_tests_par jsonb;
  v_recues integer := 0;
  v_acceptees integer := 0;
  v_refusees integer := 0;
  v_attente integer := 0;
begin
  if not private.is_admin() then
    raise exception 'هذه العملية للمشرف العام فقط';
  end if;

  if p_saison_id is null or btrim(p_saison_id) = '' then
    raise exception 'معرّف الموسم مفقود';
  end if;

  select *
    into v_saison
  from public.saisons z
  where z.id = btrim(p_saison_id);

  if not found then
    raise exception 'الموسم غير موجود';
  end if;

  v_id := v_saison.id;

  v_rows := array(
    select m
    from public.compute_season_member_stats(v_id) as m
  );

  select
    count(*)::integer,
    count(*) filter (where m.genre = 'ذكر')::integer,
    count(*) filter (where m.genre = 'أنثى')::integer,
    count(*) filter (where m.type_demande = 'join')::integer,
    count(*) filter (where m.type_demande = 'season_renewal')::integer,
    coalesce(sum(m.presences_present), 0)::integer,
    coalesce(sum(m.presences_absent), 0)::integer,
    count(*) filter (where m.presence_pct >= 90)::integer,
    count(*) filter (where m.presence_pct >= 75 and m.presence_pct < 90)::integer,
    count(*) filter (where m.presence_pct >= 50 and m.presence_pct < 75)::integer,
    count(*) filter (where m.presence_pct < 50)::integer,
    count(*) filter (where m.presence_pct is null)::integer,
    case
      when count(m.pos_fin) = 0 then null
      else round(avg(private.progression_pct(m.pos_fin)))
    end,
    count(m.pos_fin)::integer,
    case
      when count(m.gain_tumun) = 0 then null
      else round(avg(m.gain_tumun)::numeric / 8, 2)
    end,
    case
      when count(m.gain_tumun) = 0 then null
      else round(sum(m.gain_tumun)::numeric / 8, 2)
    end,
    count(*) filter (where m.pos_fin = 480)::integer,
    jsonb_build_array(
      jsonb_build_object('key', '0-5', 'count', count(*) filter (where m.pos_fin >= 0 and m.pos_fin < 80)),
      jsonb_build_object('key', '5-10', 'count', count(*) filter (where m.pos_fin >= 80 and m.pos_fin < 160)),
      jsonb_build_object('key', '10-15', 'count', count(*) filter (where m.pos_fin >= 160 and m.pos_fin < 240)),
      jsonb_build_object('key', '15-20', 'count', count(*) filter (where m.pos_fin >= 240 and m.pos_fin < 320)),
      jsonb_build_object('key', '20-25', 'count', count(*) filter (where m.pos_fin >= 320 and m.pos_fin < 400)),
      jsonb_build_object('key', '25-30', 'count', count(*) filter (where m.pos_fin >= 400 and m.pos_fin <= 480))
    ),
    count(*) filter (where m.objectif_cible is not null)::integer,
    count(*) filter (where m.objectif_atteint)::integer,
    -- Même D que objectif_atteint (pos_debut, en أثمان). D NULL : exclu de la moyenne.
    round(
      avg(
        least(
          100,
          greatest(
            0,
            100.0 * (m.pos_fin - m.pos_debut)
              / nullif(m.objectif_cible::integer * 8, 0)
          )
        )
      ) filter (where m.objectif_cible is not null),
      2
    )
  into
    v_membres, v_male, v_female, v_join, v_renew,
    v_present, v_absent, v_ge90, v_p75, v_p50, v_lt50, v_sans,
    v_avg_pos, v_avec, v_gain_moy, v_gain_tot, v_khatm, v_tranches,
    v_fixes, v_atteints, v_real
  from unnest(v_rows) as m;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('key', t.mois, 'pct', t.pct)
      order by t.mois
    ),
    '[]'::jsonb
  )
    into v_par_mois
  from (
    select
      to_char(pr.date, 'YYYY-MM') as mois,
      round(
        100.0 * count(*) filter (where pr.statut::text = 'present')
        / nullif(count(*), 0)
      ) as pct
    from public.presences pr
    join unnest(v_rows) as u
      on u.membre_id = pr.membre_id
     and u.seance_id = pr.seance_id
    where pr.statut::text in ('present', 'absent')
    group by to_char(pr.date, 'YYYY-MM')
  ) t;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('key', t.mois, 'avgPct', t.avg_pct)
      order by t.mois
    ),
    '[]'::jsonb
  )
    into v_timeline
  from (
    select mois, round(avg(pct)) as avg_pct
    from (
      select distinct on (raw.membre_id, raw.mois)
        raw.membre_id,
        raw.mois,
        raw.pct
      from (
        select
          p.membre_id,
          to_char(timezone('Africa/Casablanca', p.date), 'YYYY-MM') as mois,
          private.progression_pct(
            private.progression_tumun(p.nb_hizb_completes, p.tumun_courant)
          ) as pct,
          p.date,
          p.id
        from public.progression p
        where p.saison_id = v_id
          and p.nb_hizb_completes is not null
          and p.membre_id in (select u.membre_id from unnest(v_rows) as u)
      ) raw
      order by raw.membre_id, raw.mois, raw.date desc, raw.id desc
    ) last_per
    group by mois
  ) t;

  select coalesce(jsonb_agg(row_obj order by row_obj->>'name', row_obj->>'id'), '[]'::jsonb)
    into v_by_seance
  from (
    select jsonb_build_object(
      'id', s.id,
      'name', s.nom,
      'genre', s.genre,
      'supervisorId', s.superviseur_id,
      'supervisorName', nullif(btrim(concat_ws(' ', sup.first_name, sup.last_name)), ''),
      'membersCount', count(m.membre_id),
      'membersMale', count(m.membre_id) filter (where m.genre = 'ذكر'),
      'membersFemale', count(m.membre_id) filter (where m.genre = 'أنثى'),
      'avgProgressPct', round(avg(private.progression_pct(m.pos_fin))),
      'presencePct', case
        when coalesce(prs.present, 0) + coalesce(prs.absent, 0) = 0 then null
        else round(100.0 * prs.present / (prs.present + prs.absent))
      end,
      'presenceMarked', coalesce(prs.present, 0) + coalesce(prs.absent, 0),
      'sessionCount', coalesce(prs.jours, 0),
      'gainMoyenHizb', round(avg(m.gain_tumun)::numeric / 8, 2)
    ) as row_obj
    from public.seances s
    left join public.profiles sup on sup.id = s.superviseur_id
    left join unnest(v_rows) as m on m.seance_id = s.id
    left join (
      select
        pr.seance_id,
        count(*) filter (where pr.statut::text = 'present')::integer as present,
        count(*) filter (where pr.statut::text = 'absent')::integer as absent,
        count(distinct pr.date)::integer as jours
      from public.presences pr
      join unnest(v_rows) as u
        on u.membre_id = pr.membre_id
       and u.seance_id = pr.seance_id
      where pr.statut::text in ('present', 'absent')
      group by pr.seance_id
    ) prs on prs.seance_id = s.id
    where s.saison_id = v_id
    group by
      s.id, s.nom, s.genre, s.superviseur_id,
      sup.first_name, sup.last_name,
      prs.present, prs.absent, prs.jours
  ) q;

  select coalesce(jsonb_agg(row_obj order by row_obj->>'name', row_obj->>'id'), '[]'::jsonb)
    into v_by_sup
  from (
    select jsonb_build_object(
      'id', sup_seances.superviseur_id,
      'name', sup_seances.nom,
      'seancesCount', sup_seances.seances_count,
      'membersCount', coalesce(mem.n, 0),
      'membersDistinct', coalesce(mem.n, 0),
      'avgProgressPct', mem.avg_pos,
      'avgPresencePct', case
        when coalesce(prs.present, 0) + coalesce(prs.absent, 0) = 0 then null
        else round(100.0 * prs.present / (prs.present + prs.absent))
      end,
      'gainMoyenHizb', mem.gain_moy,
      'joursTenus', coalesce(prs.jours, 0)
    ) as row_obj
    from (
      select
        s.superviseur_id,
        nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') as nom,
        count(*)::integer as seances_count
      from public.seances s
      left join public.profiles p on p.id = s.superviseur_id
      where s.saison_id = v_id
        and s.superviseur_id is not null
      group by s.superviseur_id, p.first_name, p.last_name
    ) sup_seances
    left join (
      select
        m.superviseur_id,
        count(*)::integer as n,
        round(avg(private.progression_pct(m.pos_fin))) as avg_pos,
        round(avg(m.gain_tumun)::numeric / 8, 2) as gain_moy
      from unnest(v_rows) as m
      where m.superviseur_id is not null
      group by m.superviseur_id
    ) mem on mem.superviseur_id = sup_seances.superviseur_id
    left join (
      select
        u.superviseur_id,
        count(*) filter (where pr.statut::text = 'present')::integer as present,
        count(*) filter (where pr.statut::text = 'absent')::integer as absent,
        count(distinct pr.date)::integer as jours
      from unnest(v_rows) as u
      join public.presences pr
        on pr.membre_id = u.membre_id
       and pr.seance_id = u.seance_id
      where u.superviseur_id is not null
        and pr.statut::text in ('present', 'absent')
      group by u.superviseur_id
    ) prs on prs.superviseur_id = sup_seances.superviseur_id
  ) q;

  -- Notes de toute invitation de la saison, y compris un membre qui n'est
  -- plus accepte. Le barème est 0–20 pour tous les tests.
  select
    count(distinct t.id)::integer,
    count(ti.id)::integer,
    count(ti.id) filter (where ti.statut::text = 'note' and ti.note is not null)::integer,
    round(avg(ti.note) filter (where ti.statut::text = 'note' and ti.note is not null), 2),
    min(ti.note) filter (where ti.statut::text = 'note' and ti.note is not null),
    max(ti.note) filter (where ti.statut::text = 'note' and ti.note is not null)
  into
    v_tests_count, v_tests_invites, v_tests_notes,
    v_tests_moy, v_tests_min, v_tests_max
  from public.tests t
  left join public.test_invitations ti on ti.test_id = t.id
  where t.saison_id = v_id;

  select jsonb_build_array(
    jsonb_build_object(
      'key', '0-5',
      'count', count(*) filter (where g.note >= 0 and g.note < 5)
    ),
    jsonb_build_object(
      'key', '5-10',
      'count', count(*) filter (where g.note >= 5 and g.note < 10)
    ),
    jsonb_build_object(
      'key', '10-15',
      'count', count(*) filter (where g.note >= 10 and g.note < 15)
    ),
    jsonb_build_object(
      'key', '15-20',
      'count', count(*) filter (where g.note >= 15 and g.note <= 20)
    )
  )
    into v_tests_dist
  from (
    select ti.note
    from public.test_invitations ti
    join public.tests t on t.id = ti.test_id
    where t.saison_id = v_id
      and ti.statut::text = 'note'
      and ti.note is not null
  ) g;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'titre', t.titre,
        'date', d.premiere,
        'invites', coalesce(n.invites, 0),
        'notes', coalesce(n.notes, 0),
        'moyenne', n.moyenne
      )
      order by d.premiere nulls last, t.titre
    ),
    '[]'::jsonb
  )
    into v_tests_par
  from public.tests t
  left join (
    select td.test_id, min(td.date_proposee) as premiere
    from public.test_dates td
    group by td.test_id
  ) d on d.test_id = t.id
  left join (
    select
      ti.test_id,
      count(*)::integer as invites,
      count(*) filter (where ti.statut::text = 'note' and ti.note is not null)::integer as notes,
      round(
        avg(ti.note) filter (where ti.statut::text = 'note' and ti.note is not null),
        2
      ) as moyenne
    from public.test_invitations ti
    group by ti.test_id
  ) n on n.test_id = t.id
  where t.saison_id = v_id;

  -- pending = en attente de décision.
  -- invited et activated = la demande a été acceptée (compte pas encore
  -- activé, ou déjà activé). rejected = refusée.
  select
    count(*)::integer,
    count(*) filter (where app.status in ('invited', 'activated'))::integer,
    count(*) filter (where app.status = 'rejected')::integer,
    count(*) filter (where app.status = 'pending')::integer
  into v_recues, v_acceptees, v_refusees, v_attente
  from public.member_applications app
  where app.season_id = v_id;

  return jsonb_build_object(
    'schemaVersion', 2,
    'saison', jsonb_build_object(
      'id', v_saison.id,
      'name', v_saison.name,
      'type', v_saison.type,
      'active', v_saison.active,
      'dateDebut', v_saison.start_date,
      'dateFin', v_saison.end_date
    ),
    'effectifs', jsonb_build_object(
      'membres', v_membres,
      'male', v_male,
      'female', v_female,
      'nonSpecifie', greatest(0, v_membres - v_male - v_female),
      'nouveaux', v_join,
      'renouvellements', v_renew,
      'retires', null,
      'demandes', jsonb_build_object(
        'recues', v_recues,
        'acceptees', v_acceptees,
        'refusees', v_refusees,
        'enAttente', v_attente
      ),
      'tauxAcceptation', case
        when v_acceptees + v_refusees = 0 then null
        else round(100.0 * v_acceptees / (v_acceptees + v_refusees))
      end
    ),
    'presence', jsonb_build_object(
      'pct', case
        when v_present + v_absent = 0 then null
        else round(100.0 * v_present / (v_present + v_absent))
      end,
      'present', v_present,
      'absent', v_absent,
      'jours', (
        select count(distinct pr.date)::integer
        from public.presences pr
        join unnest(v_rows) as u
          on u.membre_id = pr.membre_id
         and u.seance_id = pr.seance_id
        where pr.statut::text in ('present', 'absent')
      ),
      'parMois', v_par_mois,
      'repartition', jsonb_build_object(
        'ge90', v_ge90,
        'p75_90', v_p75,
        'p50_75', v_p50,
        'lt50', v_lt50,
        'sansDonnees', v_sans
      )
    ),
    'progression', jsonb_build_object(
      'avgPositionPct', v_avg_pos,
      'membresAvecDonnees', v_avec,
      'gainMoyenHizb', v_gain_moy,
      'gainTotalHizb', v_gain_tot,
      'khatm', v_khatm,
      'parTranche', v_tranches,
      'timeline', v_timeline
    ),
    'tests', jsonb_build_object(
      'count', v_tests_count,
      'invites', v_tests_invites,
      'notes', v_tests_notes,
      'moyenne', v_tests_moy,
      'min', v_tests_min,
      'max', v_tests_max,
      'distribution', v_tests_dist,
      'parTest', v_tests_par
    ),
    'objectifs', jsonb_build_object(
      'fixes', v_fixes,
      'atteints', v_atteints,
      'taux', case
        when v_fixes = 0 then null
        else round(100.0 * v_atteints / v_fixes)
      end,
      'realisationMoyennePct', v_real
    ),
    'bySeance', v_by_seance,
    'bySupervisor', v_by_sup,
    'progressTimeline', v_timeline
  );
end;
$$;

-- Grants inchangés (0123 + 0127). snapshot_season (et sa garde « saison close »)
-- n'est pas redéfinie : elle appelle ces deux fonctions.
revoke all on function public.compute_season_stats(text) from public, anon;
revoke all on function public.compute_season_member_stats(text) from public, anon;
grant execute on function public.compute_season_stats(text) to authenticated;
grant execute on function public.compute_season_member_stats(text) to authenticated;

-- ---------------------------------------------------------------------------
-- e.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- f. Vérifications (SQL Editor, pas par l'app)
-- ---------------------------------------------------------------------------
--
-- A. Fonctions et droits.
--
-- select n.nspname, p.proname, p.prosecdef, p.proconfig,
--        pg_get_function_identity_arguments(p.oid) as args
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where p.proname in ('season_start_tumun', 'member_season_progress',
--                     'get_member_season_progress', 'compute_season_member_stats',
--                     'compute_season_stats');
--
-- select has_function_privilege('authenticated', 'public.get_member_season_progress(uuid)', 'execute');   -- true
-- select has_function_privilege('anon', 'public.get_member_season_progress(uuid)', 'execute');            -- false
-- select has_function_privilege('authenticated', 'private.season_start_tumun(uuid, text)', 'execute');    -- false
--
-- B. Membres dont l'ancien départ stocké diffère du départ calculé (saison active).
--
-- select o.membre_id, o.nb_hizb_cible, o.nb_hizb_depart,
--        private.season_start_tumun(o.membre_id, o.saison_id) as depart_tumun,
--        private.member_season_progress(o.membre_id, o.saison_id) as calc
-- from public.objectifs o
-- join public.saisons z on z.id = o.saison_id and z.active
-- where o.nb_hizb_depart * 8 is distinct from private.season_start_tumun(o.membre_id, o.saison_id)
-- order by o.membre_id;
--
-- C. Objectif atteint avant / après (en tant qu'admin, via l'app ou en simulant
--    request.jwt.claims comme dans le bloc D).
--
-- select membre_id, pos_debut, pos_fin, gain_tumun, objectif_cible,
--        objectif_depart, objectif_atteint
-- from public.compute_season_member_stats((select id from public.saisons where active limit 1))
-- order by objectif_atteint nulls last, membre_id;
--
-- D. Test à blanc. Toutes les écritures sont annulées : le bloc se termine
--    TOUJOURS par une exception qui contient les résultats. Prérequis : une
--    saison active avec start_date, un membre « accepte » dedans, un admin.
--
-- do $test$
-- declare
--   v_admin uuid;
--   v_membre uuid;
--   v_saison text;
--   v_start timestamptz;
--   v_t timestamptz;
--   v_out text := '';
--   r jsonb;
-- begin
--   select z.id, z.start_date::timestamp at time zone 'Africa/Casablanca'
--     into v_saison, v_start
--   from public.saisons z where z.active and z.start_date is not null limit 1;
--   if v_saison is null then raise exception 'TEST: aucune saison active datée'; end if;
--
--   select i.membre_id into v_membre
--   from public.inscriptions i
--   where i.saison_id = v_saison and i.statut::text = 'accepte'
--   limit 1;
--   if v_membre is null then raise exception 'TEST: aucun membre accepte'; end if;
--
--   select p.id into v_admin
--   from public.profiles p
--   where private.profile_has_role(p.id, 'admin')
--   limit 1;
--   if v_admin is null then raise exception 'TEST: aucun admin'; end if;
--
--   -- Simule l'admin pour auth.uid() / private.is_admin().
--   perform set_config('request.jwt.claims',
--     jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
--
--   v_t := greatest(now(), v_start + interval '1 day');
--
--   -- 1. Objectif sans position. Attendu : sans_position, depart/avancement null.
--   delete from public.progression where membre_id = v_membre;
--   delete from public.objectifs where membre_id = v_membre and saison_id = v_saison;
--   insert into public.objectifs (membre_id, saison_id, nb_hizb_cible) values (v_membre, v_saison, 5);
--   r := public.get_member_season_progress(v_membre);
--   v_out := v_out || E'\n1 objectif sans position : ' || r::text;
--
--   -- 2. Position (5 / 0) puis objectif 5. Attendu : D 40, G 0, 0 %, fin 80.
--   delete from public.progression where membre_id = v_membre;
--   delete from public.objectifs where membre_id = v_membre and saison_id = v_saison;
--   insert into public.progression (membre_id, saison_id, date, nb_hizb_completes, tumun_courant)
--     values (v_membre, v_saison, v_t, 5, 0);
--   insert into public.objectifs (membre_id, saison_id, nb_hizb_cible) values (v_membre, v_saison, 5);
--   r := public.get_member_season_progress(v_membre);
--   v_out := v_out || E'\n2 position puis objectif : ' || r::text;
--
--   -- 3. Objectif 5 puis position (5 / 0). Attendu identique au 2 (D 40, 0 %).
--   --    Puis (6 / 4) = 52 : G 12, 30 %.
--   delete from public.progression where membre_id = v_membre;
--   delete from public.objectifs where membre_id = v_membre and saison_id = v_saison;
--   insert into public.objectifs (membre_id, saison_id, nb_hizb_cible) values (v_membre, v_saison, 5);
--   insert into public.progression (membre_id, saison_id, date, nb_hizb_completes, tumun_courant)
--     values (v_membre, v_saison, v_t, 5, 0);
--   r := public.get_member_season_progress(v_membre);
--   v_out := v_out || E'\n3a objectif puis position : ' || r::text;
--   insert into public.progression (membre_id, saison_id, date, nb_hizb_completes, tumun_courant)
--     values (v_membre, v_saison, v_t + interval '1 minute', 6, 4);
--   r := public.get_member_season_progress(v_membre);
--   v_out := v_out || E'\n3b puis 6/4 : ' || r::text;
--
--   -- 4. Correction à la baisse : (5 / 0) puis (4 / 0). Attendu : D 32, G 0.
--   --    Puis (6 / 0) = 48 : G 16, 40 %.
--   delete from public.progression where membre_id = v_membre;
--   insert into public.progression (membre_id, saison_id, date, nb_hizb_completes, tumun_courant)
--     values (v_membre, v_saison, v_t, 5, 0);
--   insert into public.progression (membre_id, saison_id, date, nb_hizb_completes, tumun_courant)
--     values (v_membre, v_saison, v_t + interval '1 minute', 4, 0);
--   r := public.get_member_season_progress(v_membre);
--   v_out := v_out || E'\n4a correction a la baisse : ' || r::text;
--   insert into public.progression (membre_id, saison_id, date, nb_hizb_completes, tumun_courant)
--     values (v_membre, v_saison, v_t + interval '2 minutes', 6, 0);
--   r := public.get_member_season_progress(v_membre);
--   v_out := v_out || E'\n4b puis 6/0 : ' || r::text;
--
--   -- 5. Position avant la saison (3 / 0) puis (5 / 0) dans la saison.
--   --    Attendu : D 24, P 40, G 16, 40 %, objectif_atteint false.
--   delete from public.progression where membre_id = v_membre;
--   insert into public.progression (membre_id, saison_id, date, nb_hizb_completes, tumun_courant)
--     values (v_membre, null, v_start - interval '10 days', 3, 0);
--   insert into public.progression (membre_id, saison_id, date, nb_hizb_completes, tumun_courant)
--     values (v_membre, v_saison, v_t, 5, 0);
--   r := public.get_member_season_progress(v_membre);
--   v_out := v_out || E'\n5 position avant la saison : ' || r::text;
--   select v_out || E'\n5 stats : pos_debut=' || coalesce(m.pos_debut::text, 'null')
--          || ' objectif_depart=' || coalesce(m.objectif_depart::text, 'null')
--          || ' objectif_atteint=' || coalesce(m.objectif_atteint::text, 'null')
--     into v_out
--   from public.compute_season_member_stats(v_saison) m
--   where m.membre_id = v_membre;
--
--   -- 6. Accès refusé pour un autre utilisateur.
--   perform set_config('request.jwt.claims',
--     jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
--   begin
--     r := public.get_member_season_progress(v_membre);
--     v_out := v_out || E'\n6 acces : ACCEPTE (anomalie)';
--   exception when others then
--     v_out := v_out || E'\n6 acces : refuse (' || sqlerrm || ')';
--   end;
--
--   raise exception 'TEST 0135 (annulé) :%', v_out;
-- end;
-- $test$;
