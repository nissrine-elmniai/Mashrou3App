-- Migration 0033 : historique de planning des séances (jour/heure_debut/heure_fin),
-- pour que le calcul des occurrences passées utilise le bon jour en vigueur à
-- chaque période, plutôt que le jour actuel appliqué rétroactivement.

create table if not exists seance_planning_history (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid not null references seances(id) on delete cascade,
  jour jour_semaine,
  heure_debut time,
  heure_fin time,
  valide_depuis timestamptz not null,
  valide_jusqu_a timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_seance_planning_history_seance_id
  on seance_planning_history(seance_id);

alter table seances
  add column if not exists planning_valide_depuis timestamptz not null default now();

-- RLS : lecture seule pour les superviseurs de la séance concernée + admin
alter table seance_planning_history enable row level security;

create policy seance_planning_history_select_superviseur
on seance_planning_history
for select
to authenticated
using (
  exists (
    select 1 from seances s
    where s.id = seance_planning_history.seance_id
    and s.superviseur_id = auth.uid()
  )
);

create policy seance_planning_history_admin_all
on seance_planning_history
for all
to authenticated
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role = 'admin'::text
  )
);

grant select on seance_planning_history to authenticated;
grant all on seance_planning_history to postgres, service_role;

-- Vérification post-migration
select column_name from information_schema.columns
where table_name = 'seances' and column_name = 'planning_valide_depuis';

select table_name from information_schema.tables
where table_name = 'seance_planning_history';