-- 0132_member_applications_accepted_at_heure.sql
--
-- L'ancien client écrivait accepted_at avec le jour UTC seul (minuit).
-- On ne rétablit l'heure que lorsque la décision du même jour UTC est connue.
-- Aucun changement de schéma : pas de notify pgrst.
--
-- À lancer AVANT cet UPDATE (triggers réels de la base) :
-- select tgname, pg_get_triggerdef(t.oid)
-- from pg_trigger t
-- where t.tgrelid = 'public.member_applications'::regclass
--   and not t.tgisinternal
-- order by tgname;
--
-- D'après le dépôt, un UPDATE de accepted_at seul déclenche uniquement
-- member_applications_guard (BEFORE INSERT OR UPDATE, 0102).
-- En SQL Editor le rôle est postgres : auth.role() n'est ni authenticated
-- ni anon, la fonction rend NEW sans le modifier (0111, lignes 28-29).
-- Ne se déclenchent pas (AFTER UPDATE OF status, ou d'autres colonnes) :
-- notify_member_applications_decision, notify_member_applications_sans_affectation,
-- member_applications_auto_affectation, member_applications_sync_profile.
-- updated_at n'est donc pas réécrit, et le profil n'est pas resynchronisé.

-- Avant : toutes les lignes qui ont un accepted_at, avec l'action prévue.
-- select id, kind, status,
--        accepted_at at time zone 'Africa/Casablanca' as accepted_casa,
--        activated_at at time zone 'Africa/Casablanca' as activated_casa,
--        updated_at at time zone 'Africa/Casablanca' as updated_casa,
--        case
--          when (accepted_at at time zone 'UTC')::time = time '00:00:00'
--           and kind = 'season_renewal' and status = 'activated'
--           and activated_at is not null
--           and (activated_at at time zone 'UTC')::date
--               = (accepted_at at time zone 'UTC')::date
--            then 'renouvellement'
--          when (accepted_at at time zone 'UTC')::time = time '00:00:00'
--           and kind = 'join' and status = 'invited'
--           and updated_at is not null
--           and (updated_at at time zone 'UTC')::date
--               = (accepted_at at time zone 'UTC')::date
--            then 'invitation'
--          else 'inchangé'
--        end as action
-- from public.member_applications
-- where accepted_at is not null
-- order by accepted_at;

-- Inchangés : accepted_at absent ou pas à minuit UTC ; minuit UTC mais
-- kind/status autre (join activated, renewal invited, pending, rejected) ;
-- renouvellement activated dont activated_at est nul ou d'un autre jour UTC ;
-- invitation join dont updated_at est nul ou d'un autre jour UTC.

update public.member_applications
set accepted_at = activated_at
where (accepted_at at time zone 'UTC')::time = time '00:00:00'
  and kind = 'season_renewal'
  and status = 'activated'
  and activated_at is not null
  and (activated_at at time zone 'UTC')::date
      = (accepted_at at time zone 'UTC')::date;

update public.member_applications
set accepted_at = updated_at
where (accepted_at at time zone 'UTC')::time = time '00:00:00'
  and kind = 'join'
  and status = 'invited'
  and updated_at is not null
  and (updated_at at time zone 'UTC')::date
      = (accepted_at at time zone 'UTC')::date;

-- Après : mêmes colonnes, heure Africa/Casablanca.
-- select id, kind, status,
--        accepted_at at time zone 'Africa/Casablanca' as accepted_casa,
--        activated_at at time zone 'Africa/Casablanca' as activated_casa,
--        updated_at at time zone 'Africa/Casablanca' as updated_casa
-- from public.member_applications
-- where accepted_at is not null
-- order by accepted_at;
