-- MIGRATION 0067 — préfixes de migration uniques à partir d'ici
-- Les fichiers historiques 0024/0026/0029/0030/0033/0034/0035/0042/0043/0044/0047
-- existent en plusieurs exemplaires (même numéro, noms différents).
-- Le CLI Supabase ne retient que le préfixe avant le premier « _ » : un seul
-- fichier par numéro est appliqué. Le schéma live a été aligné via SQL Editor.
--
-- Règle : toute nouvelle migration DOIT utiliser 0068, 0069, … sans collision.
-- Ne pas ré-exécuter 0035_saisons.sql (DROP COLUMN destructif).

do $$
begin
  null;
end $$;

notify pgrst, 'reload schema';
