-- Vérifications LOT 1 — après 0070–0071. Lecture / simulations ciblées.

-- A) Les lignes historiques de presence_rappels n'ont généré aucune notif
--    (CREATE TRIGGER ne rejoue pas). Attendu : 0.
select count(*) as presence_notifs
from public.notifications
where category = 'presence';

select r.seance_id, r.date::text, r.nb_rappels_envoyes, r.push_sent_at,
       n.id as notification_id
from public.presence_rappels r
left join public.notifications n
  on n.source_table = 'presence_rappels'
 and n.source_id like r.id::text || ':%'
order by r.date desc;

-- B) Simuler un rappel dans la fenêtre 48h (occurrence courante d'une séance active).
--    Remplacer les uuid si besoin. La ligne samedi 2026-09-12 est déjà dans la fenêtre :
--    un UPDATE qui incrémente nb_rappels_envoyes doit créer UNE notif superviseur.
--
-- update public.presence_rappels
-- set nb_rappels_envoyes = nb_rappels_envoyes + 1,
--     dernier_rappel_le = now()
-- where seance_id = '18b1e11a-e401-42ea-9e44-97ea9142e537'
--   and date = '2026-09-12';
--
-- Ou : select public.check_presence_reminders();
--      (n'incrémente que si ≥ 12 h depuis dernier_rappel_le)

-- C) Simuler une absence membre (remplacer membre_id / seance_id / date) :
-- insert into public.presences (seance_id, membre_id, date, statut)
-- values (
--   '18b1e11a-e401-42ea-9e44-97ea9142e537',
--   '<profiles.id du membre>',
--   current_date,
--   'absent'
-- )
-- on conflict (membre_id, seance_id, date)
-- do update set statut = excluded.statut;
--
-- Correction absent → present : aucune 2e notif.
-- update public.presences set statut = 'present' where id = '<uuid>';
--
-- present → absent : une notif si source_id (= presences.id) n'a pas déjà
-- une ligne presence_absence (UNIQUE lot 0). Si le membre avait déjà été
-- notifié sur CETTE ligne, unique_violation → silence.

-- D) File présence + push lot 0 (no_token attendu s'il n'y a pas de push_tokens)
select
  n.id,
  n.user_id,
  n.event_type,
  n.title,
  n.source_id,
  n.push_sent_at,
  n.push_error,
  n.push_attempts,
  n.created_at
from public.notifications n
where n.category = 'presence'
order by n.created_at desc;

-- E) Boucle trigger : compter les notifs présence 24h par event_type + source_id.
--    n > 1 = anomalie (UNIQUE devrait déjà interdire).
select
  event_type,
  source_id,
  count(*) as n
from public.notifications
where category = 'presence'
  and created_at >= now() - interval '24 hours'
group by event_type, source_id
order by n desc, event_type, source_id;

-- F) Cadence 0072 : attendu */15 * * * * (le 12 h reste dans le ON CONFLICT du job).
select jobid, jobname, schedule, command
from cron.job
where jobname = 'presence-reminder-check';
