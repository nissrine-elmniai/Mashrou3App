-- Migration 0032 : ajout des GRANTS INSERT/UPDATE manquants sur presences
-- pour le rôle authenticated. Les policies RLS (0031) existaient déjà mais
-- étaient inopérantes sans ce grant de base.
-- Note : exécutée manuellement le 2026-08-31, documentée a posteriori.

grant insert, update on presences to authenticated;
