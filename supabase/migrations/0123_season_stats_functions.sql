-- 0123_season_stats_functions.sql
-- Calcul live (aucune écriture) et snapshot serveur.
--
-- private.is_admin() (0026) est réutilisée : pas de public.is_admin().
-- Elle vaut vrai si 'admin' est dans roles[] (dès que ce tableau est non vide),
-- sinon si role = 'admin'.
--
-- Unités : nb_hizb_cible et nb_hizb_depart sont des حزب (0057, 0062, 1–60 et 0–60).
-- La position est en tumun (hizb × 8 + tumun_courant, plafonnée à 480).
-- Objectif atteint si (pos_fin ou 0) − départ × 8 ≥ cible × 8.
--
-- inscriptions_membre_id_saison_id_key : une seule inscription par
-- (membre_id, saison_id). La séance du membre est celle de cette ligne.
-- Les présences comptées sont celles de cette séance, pas la somme de
-- plusieurs séances.
--
-- retires : null. inscriptions ne conserve que le statut courant, sans historique.
--
-- Barème des notes : 0 à 20 (test_invitations_note_0_20, migration 0090).
-- Pas de note maximale par test. Tranches 0–5, 5–10, 10–15, 15–20.
-- La date d'un test est min(test_dates.date_proposee) : tests.date_test a été
-- supprimée par 0090.
--
-- Mois de progression : date (timestamptz) en Africa/Casablanca, jamais date_saisie.
-- Mois de présence : to_char(presences.date). Le type de cette colonne n'est pas
-- créé dans supabase/migrations/ ; s'il s'agit d'un date, le mois est celui du
-- calendrier. Requête de confirmation dans le rapport.
--
-- Moyenne sans dénominateur : null dans le JSON. Les colonnes scalaires de
-- season_stats restent NOT NULL : snapshot_season y écrit 0 à la place de null.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

create or replace function private.progression_tumun(
  p_hizb smallint,
  p_tumun smallint
)
returns smallint
language sql
immutable
set search_path = public
as $$
  select case
    when p_hizb is null then null
    else least(
      480,
      greatest(0, p_hizb::integer * 8 + coalesce(p_tumun, 0)::integer)
    )::smallint
  end;
$$;

create or replace function private.progression_pct(p_tumun smallint)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_tumun is null then null
    else least(100, round(100.0 * p_tumun / 480))
  end;
$$;

revoke all on function private.progression_tumun(smallint, smallint) from public, anon, authenticated;
revoke all on function private.progression_pct(smallint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Une ligne par membre inscrit accepte.
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
  first_season as (
    select distinct on (p.membre_id)
      p.membre_id,
      p.date,
      p.id,
      private.progression_tumun(p.nb_hizb_completes, p.tumun_courant) as pos
    from public.progression p
    join accepted a on a.membre_id = p.membre_id
    where p.saison_id = p_saison_id
    order by p.membre_id, p.date asc, p.id asc
  ),
  prior as (
    select distinct on (f.membre_id)
      f.membre_id,
      private.progression_tumun(p.nb_hizb_completes, p.tumun_courant) as pos
    from first_season f
    join public.progression p
      on p.membre_id = f.membre_id
     and (p.date < f.date or (p.date = f.date and p.id < f.id))
    order by f.membre_id, p.date desc, p.id desc
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
      o.nb_hizb_cible::smallint as cible,
      o.nb_hizb_depart::smallint as depart
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
      case
        when fs.membre_id is null then null::smallint
        when pri.membre_id is not null then pri.pos
        else fs.pos
      end as pos_debut,
      coalesce(iv.invites, 0) as invites,
      coalesce(iv.notes, 0) as notes,
      iv.moyenne as note_moyenne,
      o.cible as objectif_cible,
      o.depart as objectif_depart,
      o.membre_id as objectif_membre
    from seance_info si
    left join genre_app ga on ga.user_id = si.membre_id
    left join kind_app ka on ka.user_id = si.membre_id
    left join pres pr on pr.membre_id = si.membre_id
    left join fin on fin.membre_id = si.membre_id
    left join first_season fs on fs.membre_id = si.membre_id
    left join prior pri on pri.membre_id = si.membre_id
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
    b.objectif_depart,
    case
      when b.objectif_membre is null then null::boolean
      else (coalesce(b.pos_fin, 0) - coalesce(b.objectif_depart, 0)::integer * 8)
           >= (b.objectif_cible::integer * 8)
    end,
    'snapshot'::text,
    now()
  from base b;
end;
$$;

-- ---------------------------------------------------------------------------
-- JSON v2. Aucune écriture.
-- ---------------------------------------------------------------------------

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
    round(
      avg(
        least(
          100,
          greatest(
            0,
            100.0 * (coalesce(m.pos_fin, 0) - coalesce(m.objectif_depart, 0)::integer * 8)
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

-- ---------------------------------------------------------------------------
-- Upsert season_stats + remplacement des lignes membre de la saison.
-- ---------------------------------------------------------------------------

create or replace function public.snapshot_season(p_saison_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_details jsonb;
  v_id text;
begin
  if not private.is_admin() then
    raise exception 'هذه العملية للمشرف العام فقط';
  end if;

  if p_saison_id is null or btrim(p_saison_id) = '' then
    raise exception 'معرّف الموسم مفقود';
  end if;

  select z.id
    into v_id
  from public.saisons z
  where z.id = btrim(p_saison_id);

  if v_id is null then
    raise exception 'الموسم غير موجود';
  end if;

  -- Une saison close déjà figée n'est jamais recalculée.
  -- start_new_season (0124) n'appelle snapshot_season que pour les saisons
  -- actives, ou pour les saisons closes sans ligne season_stats : cette
  -- garde ne bloque donc aucun appel légitime.
  if exists (select 1 from public.saisons z where z.id = v_id and not z.active)
     and exists (select 1 from public.season_stats ss where ss.saison_id = v_id) then
    raise exception 'لا يمكن إعادة حساب إحصائيات موسم مغلق';
  end if;

  v_details := public.compute_season_stats(v_id);

  insert into public.season_stats (
    saison_id,
    members_total,
    members_male,
    members_female,
    seances_total,
    supervisors_total,
    avg_progress_pct,
    avg_presence_pct,
    details,
    snapshot_at,
    updated_at
  ) values (
    v_id,
    coalesce((v_details #>> '{effectifs,membres}')::integer, 0),
    coalesce((v_details #>> '{effectifs,male}')::integer, 0),
    coalesce((v_details #>> '{effectifs,female}')::integer, 0),
    coalesce(jsonb_array_length(v_details -> 'bySeance'), 0),
    coalesce(jsonb_array_length(v_details -> 'bySupervisor'), 0),
    coalesce((v_details #>> '{progression,avgPositionPct}')::numeric, 0),
    coalesce((v_details #>> '{presence,pct}')::numeric, 0),
    v_details,
    now(),
    now()
  )
  on conflict (saison_id) do update set
    members_total = excluded.members_total,
    members_male = excluded.members_male,
    members_female = excluded.members_female,
    seances_total = excluded.seances_total,
    supervisors_total = excluded.supervisors_total,
    avg_progress_pct = excluded.avg_progress_pct,
    avg_presence_pct = excluded.avg_presence_pct,
    details = excluded.details,
    snapshot_at = excluded.snapshot_at,
    updated_at = excluded.updated_at;

  -- Remplace l'historique membre de cette saison. where saison_id : pg_safeupdate.
  delete from public.season_member_stats
  where saison_id = v_id;

  insert into public.season_member_stats
  select *
  from public.compute_season_member_stats(v_id);
end;
$$;

-- Seule compute_season_stats est appelée par l'application (affichage en direct).
-- compute_season_member_stats et snapshot_season sont réservées au serveur :
-- compute_season_stats et start_new_season sont security definer et les
-- appellent avec les droits du propriétaire. auth.uid() reste celui de
-- l'appelant, donc private.is_admin() continue de s'appliquer.
revoke all on function public.compute_season_stats(text) from public, anon;
revoke all on function public.compute_season_member_stats(text) from public, anon, authenticated;
revoke all on function public.snapshot_season(text) from public, anon, authenticated;

grant execute on function public.compute_season_stats(text) to authenticated;

notify pgrst, 'reload schema';
