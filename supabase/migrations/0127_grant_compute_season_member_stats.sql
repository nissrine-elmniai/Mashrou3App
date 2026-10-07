-- 0127_grant_compute_season_member_stats.sql
-- Fonction en lecture seule (stable), security definer, contrôle
-- private.is_admin() en interne. Nécessaire pour exporter la liste des
-- membres de la saison en cours. snapshot_season reste révoquée pour
-- authenticated.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

grant execute on function public.compute_season_member_stats(text) to authenticated;

notify pgrst, 'reload schema';
