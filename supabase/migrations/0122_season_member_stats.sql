-- 0122_season_member_stats.sql
-- Historique par membre, figé au snapshot. Les séances et les comptes
-- superviseurs disparaissent au reset : seance_id et superviseur_id n'ont
-- pas de clé étrangère, les noms sont copiés en texte.
--
-- Une ligne par (saison, membre). inscriptions_membre_id_saison_id_key
-- (versionnée par 0126) impose une seule inscription par (membre_id, saison_id) :
-- la séance copiée ici est celle de cette inscription, et les présences
-- sont celles de cette séance.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

create table if not exists public.season_member_stats (
  saison_id text not null references public.saisons (id) on delete cascade,
  membre_id uuid not null references public.profiles (id) on delete cascade,
  seance_id uuid,
  seance_nom text,
  superviseur_id uuid,
  superviseur_nom text,
  genre text,
  type_demande text,
  statut_inscription text,
  presences_present integer not null default 0,
  presences_absent integer not null default 0,
  presence_pct numeric,
  pos_debut smallint,
  pos_fin smallint,
  gain_tumun smallint,
  tests_invites integer not null default 0,
  tests_notes integer not null default 0,
  note_moyenne numeric,
  objectif_cible smallint,
  objectif_depart smallint,
  objectif_atteint boolean,
  source text not null default 'snapshot'
    check (source in ('snapshot', 'rattrapage')),
  created_at timestamptz not null default now(),
  primary key (saison_id, membre_id)
);

create index if not exists season_member_stats_membre_idx
  on public.season_member_stats (membre_id);

alter table public.season_member_stats enable row level security;

drop policy if exists season_member_stats_admin_all on public.season_member_stats;

create policy season_member_stats_admin_all
  on public.season_member_stats
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

grant select, insert, update, delete on table public.season_member_stats to authenticated;

notify pgrst, 'reload schema';
