-- 0059_objectifs_grants.sql
-- La table objectifs n'ayant jamais été utilisée, elle n'avait reçu aucun
-- GRANT pour le rôle authenticated : les policies RLS de 0057 étaient
-- inopérantes (erreur 42501 à l'insert côté membre).
grant select, insert, update, delete on public.objectifs to authenticated;