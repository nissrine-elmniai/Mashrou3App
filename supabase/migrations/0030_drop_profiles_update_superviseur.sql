-- Migration 0030 : suppression de l'accès superviseur en modification sur profiles
-- Contexte : la fonctionnalité "modifier les infos d'un membre" côté superviseur
-- a été retirée. Le superviseur repasse en lecture seule sur profiles.
-- Note : cette migration a été exécutée manuellement le 2026-08-31
-- et est documentée ici a posteriori pour garder le repo synchronisé avec l'état
-- réel de la base.

drop policy if exists profiles_update_superviseur on profiles;
