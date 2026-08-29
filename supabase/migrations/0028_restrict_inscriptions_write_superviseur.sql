-- MIGRATION 0028 — retrait de inscriptions_write_superviseur (FOR ALL, 0009)
-- À exécuter dans Supabase → SQL Editor après relecture.
--
-- Cette migration retire le FOR ALL de inscriptions_write_superviseur (créée en
-- 0009) qui autorisait DELETE sans filtre statut, en conflit avec 0027 : en
-- PostgreSQL les policies RLS permissives se combinent en OR, donc 0027 seule
-- ne restreignait pas le DELETE tant que write_superviseur restait active.
--
-- Audit applicatif (app/ + lib/) : aucun usage superviseur en INSERT/UPDATE sur
-- inscriptions à ce jour — approche minimale : le superviseur garde uniquement
-- le DELETE déjà couvert par 0027 (statut = 'accepte', sa séance).
--
-- ORDRE D'EXÉCUTION : appliquer 0027 avant 0028 si ce n'est pas déjà fait.
-- Entre les deux (write_superviseur supprimée, 0027 pas encore appliquée),
-- aucune écriture superviseur sur inscriptions ne sera possible.

drop policy if exists "inscriptions_write_superviseur" on public.inscriptions;

-- Ne recrée aucune policy INSERT ou UPDATE superviseur ici.
-- inscriptions_delete_superviseur (0027) reste la seule capacité d'écriture
-- superviseur sur cette table.
--
-- Si un besoin d'INSERT/UPDATE superviseur apparaît plus tard, créer une
-- nouvelle policy dédiée avec son propre filtre (statut, séance, etc.) —
-- ne pas revenir à un FOR ALL sans condition.
