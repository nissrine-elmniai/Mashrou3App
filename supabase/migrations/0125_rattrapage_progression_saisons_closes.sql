-- 0125_rattrapage_progression_saisons_closes.sql
-- Dérogation unique : une saison close n'est normalement jamais recalculée.
-- Ici, seulement la progression, pour les snapshots v1 dont la moyenne a été
-- enregistrée à 0 alors que des lignes progression portent cette saison
-- (le client avalait l'erreur de colonnes juze/tumun, absentes de la table).
--
-- Cible :
--   saisons.active = false
--   season_stats.avg_progress_pct = 0
--   au moins une ligne progression.saison_id = cette saison
--   details.rattrapage.source distinct de 'progression' (second passage sans effet)
--   details.schemaVersion distinct de 2 (un snapshot déjà produit par 0123,
--   même à 0 %, n'est pas une moyenne perdue)
-- Les identifiants de saisons ne sont pas écrits en dur.
--
-- Position de fin = dernière ligne DE CETTE saison (pas toutes saisons).
-- Début = dernière ligne antérieure à la première ligne de la saison ;
-- à défaut, cette première ligne ; à défaut, null.
-- Gain = fin − début, en tumun.
--
-- season_stats : avg_progress_pct, details.progression (bloc v2),
-- details.progressTimeline (même tableau), details.rattrapage.
-- schemaVersion et snapshot_at ne sont pas modifiés.
-- Les autres blocs du JSON restent au format dans lequel ils ont été écrits.
--
-- season_member_stats : champs de progression seulement, source = 'rattrapage',
-- le reste aux défauts (0 ou null). ON CONFLICT DO NOTHING.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Prérequis : 0122 et 0123 (private.progression_tumun / progression_pct).

do $rattrapage$
declare
  v_n integer := 0;
begin
  -- pg_temp en tête : les tables temporaires restent visibles.
  perform set_config('search_path', 'pg_temp, public', true);

  drop table if exists pg_temp.rattrapage_cibles;
  drop table if exists pg_temp.rattrapage_pos;
  drop table if exists pg_temp.rattrapage_timeline;

  create temp table rattrapage_cibles (
    saison_id text primary key
  );

  insert into rattrapage_cibles (saison_id)
  select ss.saison_id
  from public.season_stats ss
  join public.saisons z on z.id = ss.saison_id
  where z.active = false
    and ss.avg_progress_pct = 0
    and coalesce(ss.details #>> '{rattrapage,source}', '') <> 'progression'
    and coalesce(ss.details ->> 'schemaVersion', '') <> '2'
    and exists (
      select 1
      from public.progression p
      where p.saison_id = ss.saison_id
    );

  get diagnostics v_n = row_count;
  raise notice 'rattrapage progression : % saison(s)', v_n;

  create temp table rattrapage_pos (
    saison_id text not null,
    membre_id uuid not null,
    pos_debut smallint,
    pos_fin smallint,
    gain_tumun smallint,
    primary key (saison_id, membre_id)
  );

  insert into rattrapage_pos (saison_id, membre_id, pos_debut, pos_fin, gain_tumun)
  with members as (
    select distinct p.saison_id, p.membre_id
    from public.progression p
    join rattrapage_cibles c on c.saison_id = p.saison_id
  ),
  fin as (
    -- Dernière ligne de la saison seulement.
    select distinct on (p.saison_id, p.membre_id)
      p.saison_id,
      p.membre_id,
      private.progression_tumun(p.nb_hizb_completes, p.tumun_courant) as pos
    from public.progression p
    join members m
      on m.saison_id = p.saison_id
     and m.membre_id = p.membre_id
    order by p.saison_id, p.membre_id, p.date desc, p.id desc
  ),
  first_s as (
    select distinct on (p.saison_id, p.membre_id)
      p.saison_id,
      p.membre_id,
      p.date,
      p.id,
      private.progression_tumun(p.nb_hizb_completes, p.tumun_courant) as pos
    from public.progression p
    join members m
      on m.saison_id = p.saison_id
     and m.membre_id = p.membre_id
    order by p.saison_id, p.membre_id, p.date asc, p.id asc
  ),
  prior as (
    select distinct on (f.saison_id, f.membre_id)
      f.saison_id,
      f.membre_id,
      private.progression_tumun(p.nb_hizb_completes, p.tumun_courant) as pos
    from first_s f
    join public.progression p
      on p.membre_id = f.membre_id
     and (p.date < f.date or (p.date = f.date and p.id < f.id))
    order by f.saison_id, f.membre_id, p.date desc, p.id desc
  ),
  assembled as (
    select
      m.saison_id,
      m.membre_id,
      fin.pos as pos_fin,
      case
        when f.membre_id is null then null::smallint
        when pr.membre_id is not null then pr.pos
        else f.pos
      end as pos_debut
    from members m
    left join fin
      on fin.saison_id = m.saison_id
     and fin.membre_id = m.membre_id
    left join first_s f
      on f.saison_id = m.saison_id
     and f.membre_id = m.membre_id
    left join prior pr
      on pr.saison_id = m.saison_id
     and pr.membre_id = m.membre_id
  )
  select
    a.saison_id,
    a.membre_id,
    a.pos_debut,
    a.pos_fin,
    case
      when a.pos_debut is not null and a.pos_fin is not null
        then (a.pos_fin - a.pos_debut)::smallint
      else null
    end
  from assembled a;

  create temp table rattrapage_timeline (
    saison_id text primary key,
    timeline jsonb not null
  );

  insert into rattrapage_timeline (saison_id, timeline)
  with months as (
    select
      p.saison_id,
      p.membre_id,
      to_char(timezone('Africa/Casablanca', p.date), 'YYYY-MM') as mois,
      private.progression_pct(
        private.progression_tumun(p.nb_hizb_completes, p.tumun_courant)
      ) as pct,
      p.date,
      p.id
    from public.progression p
    join rattrapage_cibles c on c.saison_id = p.saison_id
    where p.nb_hizb_completes is not null
  ),
  last_m as (
    select distinct on (saison_id, membre_id, mois)
      saison_id,
      mois,
      pct
    from months
    order by saison_id, membre_id, mois, date desc, id desc
  ),
  avg_m as (
    select saison_id, mois, round(avg(pct)) as avg_pct
    from last_m
    group by saison_id, mois
  )
  select
    c.saison_id,
    coalesce(
      jsonb_agg(
        jsonb_build_object('key', a.mois, 'avgPct', a.avg_pct)
        order by a.mois
      ) filter (where a.mois is not null),
      '[]'::jsonb
    )
  from rattrapage_cibles c
  left join avg_m a on a.saison_id = c.saison_id
  group by c.saison_id;

  update public.season_stats ss
  set
    avg_progress_pct = coalesce(agg.avg_pct, 0),
    updated_at = now(),
    details = jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(ss.details, '{}'::jsonb),
          '{progression}',
          agg.bloc,
          true
        ),
        '{progressTimeline}',
        agg.bloc -> 'timeline',
        true
      ),
      '{rattrapage}',
      jsonb_build_object('date', now(), 'source', 'progression'),
      true
    )
  from (
    select
      p.saison_id,
      case
        when count(p.pos_fin) = 0 then null
        else round(avg(private.progression_pct(p.pos_fin)))
      end as avg_pct,
      jsonb_build_object(
        'avgPositionPct', case
          when count(p.pos_fin) = 0 then null
          else round(avg(private.progression_pct(p.pos_fin)))
        end,
        'membresAvecDonnees', count(p.pos_fin),
        'gainMoyenHizb', case
          when count(p.gain_tumun) = 0 then null
          else round(avg(p.gain_tumun)::numeric / 8, 2)
        end,
        'gainTotalHizb', case
          when count(p.gain_tumun) = 0 then null
          else round(sum(p.gain_tumun)::numeric / 8, 2)
        end,
        'khatm', count(*) filter (where p.pos_fin = 480),
        'parTranche', jsonb_build_array(
          jsonb_build_object('key', '0-5', 'count', count(*) filter (where p.pos_fin >= 0 and p.pos_fin < 80)),
          jsonb_build_object('key', '5-10', 'count', count(*) filter (where p.pos_fin >= 80 and p.pos_fin < 160)),
          jsonb_build_object('key', '10-15', 'count', count(*) filter (where p.pos_fin >= 160 and p.pos_fin < 240)),
          jsonb_build_object('key', '15-20', 'count', count(*) filter (where p.pos_fin >= 240 and p.pos_fin < 320)),
          jsonb_build_object('key', '20-25', 'count', count(*) filter (where p.pos_fin >= 320 and p.pos_fin < 400)),
          jsonb_build_object('key', '25-30', 'count', count(*) filter (where p.pos_fin >= 400 and p.pos_fin <= 480))
        ),
        'timeline', coalesce(tl.timeline, '[]'::jsonb)
      ) as bloc
    from rattrapage_pos p
    left join rattrapage_timeline tl on tl.saison_id = p.saison_id
    group by p.saison_id, tl.timeline
  ) agg
  where ss.saison_id = agg.saison_id;

  insert into public.season_member_stats (
    saison_id,
    membre_id,
    pos_debut,
    pos_fin,
    gain_tumun,
    source
  )
  select
    p.saison_id,
    p.membre_id,
    p.pos_debut,
    p.pos_fin,
    p.gain_tumun,
    'rattrapage'
  from rattrapage_pos p
  on conflict (saison_id, membre_id) do nothing;
end;
$rattrapage$;

notify pgrst, 'reload schema';
