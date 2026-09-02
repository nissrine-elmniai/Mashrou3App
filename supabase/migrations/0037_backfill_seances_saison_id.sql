-- MIGRATION 0037 — rattacher les séances orphelines au musim actif
-- À exécuter après 0036_seances_saison_text_optional_time.sql

update public.seances s
set saison_id = active_saison.id
from (
  select id
  from public.saisons
  where type = 'regular'
    and active = true
  order by created_at desc
  limit 1
) as active_saison
where s.saison_id is null
  and s.statut = 'active';

notify pgrst, 'reload schema';
