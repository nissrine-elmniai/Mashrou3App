-- 0118 — Une seule saison active à la fois, tous types confondus
-- (cohérent avec le reset global au lancement d'une saison)
drop index if exists public.saisons_one_active_per_type;

create unique index saisons_one_active
  on public.saisons ((true))
  where active;

notify pgrst, 'reload schema';