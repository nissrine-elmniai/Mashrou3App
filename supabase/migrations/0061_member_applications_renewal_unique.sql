-- MIGRATION 0061 — anti-doublon réinscription saison
-- Une seule demande season_renewal non rejetée par (email, season_id).

-- Dédupliquer avant l'index unique (garde la plus récente)
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(email), season_id
      order by coalesce(updated_at, created_at) desc nulls last, created_at desc nulls last
    ) as rn
  from public.member_applications
  where coalesce(kind, 'join') = 'season_renewal'
    and status <> 'rejected'
    and email is not null
    and season_id is not null
)
update public.member_applications ma
set
  status = 'rejected',
  rejected_at = coalesce(ma.rejected_at, now()),
  updated_at = now()
from ranked r
where ma.id = r.id
  and r.rn > 1;

drop index if exists public.member_applications_renewal_email_season_uidx;
create unique index member_applications_renewal_email_season_uidx
  on public.member_applications (lower(email), season_id)
  where coalesce(kind, 'join') = 'season_renewal'
    and status <> 'rejected'
    and email is not null
    and season_id is not null;

notify pgrst, 'reload schema';
