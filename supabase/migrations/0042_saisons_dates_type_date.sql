-- 0042 — saisons.start_date / end_date : text -> date
--
-- NOTE DE PROCESS : ce changement a été appliqué manuellement via l'interface
-- Supabase (modification du type de colonne), pas par exécution de ce fichier.
-- Cette migration est écrite rétroactivement pour que la chaîne rejouée depuis
-- zéro aboutisse au même état. Elle est idempotente : sans effet si les
-- colonnes sont déjà de type date.
--
-- Contexte : 0035_saisons.sql créait start_date / end_date en `text`, ce qui
-- laissait cohabiter plusieurs formats (JJ/MM/AAAA et AAAA/MM/JJ) et faussait
-- tout parsing côté application.

do $mig$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'saisons'
        and column_name = 'start_date') = 'text' then

    -- USING explicite : les valeurs non-ISO sont en JJ/MM/AAAA (convention
    -- FR/MA). Sans ce cast, Postgres appliquerait son DateStyle par défaut
    -- (MDY) et inverserait jour et mois.
    alter table public.saisons
      alter column start_date type date
      using case
        when start_date is null or btrim(start_date) = '' then null
        when start_date ~ '^\d{4}[-/]\d{1,2}[-/]\d{1,2}$'
          then to_date(replace(btrim(start_date), '/', '-'), 'YYYY-MM-DD')
        when start_date ~ '^\d{1,2}[-/]\d{1,2}[-/]\d{4}$'
          then to_date(replace(btrim(start_date), '/', '-'), 'DD-MM-YYYY')
        else null
      end;
  end if;

  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'saisons'
        and column_name = 'end_date') = 'text' then

    alter table public.saisons
      alter column end_date type date
      using case
        when end_date is null or btrim(end_date) = '' then null
        when end_date ~ '^\d{4}[-/]\d{1,2}[-/]\d{1,2}$'
          then to_date(replace(btrim(end_date), '/', '-'), 'YYYY-MM-DD')
        when end_date ~ '^\d{1,2}[-/]\d{1,2}[-/]\d{4}$'
          then to_date(replace(btrim(end_date), '/', '-'), 'DD-MM-YYYY')
        else null
      end;
  end if;
end
$mig$;

-- Cohérence des bornes de saison
alter table public.saisons
  drop constraint if exists saisons_dates_coherentes;

alter table public.saisons
  add constraint saisons_dates_coherentes
  check (end_date is null or start_date is null or end_date >= start_date);
