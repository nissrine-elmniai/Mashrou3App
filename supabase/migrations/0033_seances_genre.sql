-- MIGRATION 0033 — genre (sexe) sur les séances et les demandes d'intégration
-- À exécuter après 0032_fix_supervisor_seance_link.sql

-- Chaque séance est réservée à un sexe (ذكر / أنثى)
alter table public.seances
  add column if not exists genre text;

update public.seances
set genre = 'ذكر'
where genre is null;

alter table public.seances
  alter column genre set not null;

alter table public.seances
  drop constraint if exists seances_genre_check;

alter table public.seances
  add constraint seances_genre_check
  check (genre in ('ذكر', 'أنثى'));

create index if not exists seances_genre_idx on public.seances (genre);

-- Sexe du membre dans la demande d'intégration
alter table public.member_applications
  add column if not exists genre text;

alter table public.member_applications
  drop constraint if exists member_applications_genre_check;

alter table public.member_applications
  add constraint member_applications_genre_check
  check (genre is null or genre in ('ذكر', 'أنثى'));
