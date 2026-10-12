# Nettoyage de la base

## 5. Anomalie : `notifications` (correctif `0131`)

83 lignes mais 521 868 mises à jour (`pg_stat_user_tables`, 7 oct. 2026).

- **Cause** : quand `send-push` ne tournait pas (secret, panne, exception), la branche cron de `private.invoke_send_push` réécrivait `dispatch_request_id` sur toutes les notifications en attente, chaque minute. `push_attempts` n'est incrémenté que par `send-push` : rien ne plafonnait la boucle.
- **Constat du 12 oct. 2026** : boucle arrêtée (+57 mises à jour en 5 jours, 0 notification en attente, dernier appel `send-push` en 200). Les lignes bloquées ont été supprimées par le reset du 4 oct.
- **Correctif `0131`** : plus d'écriture de `dispatch_request_id` dans la branche cron (seul le trigger AFTER INSERT le trace) ; `dispatch_pending_push` et `claim_pending_push_notifications` ignorent les notifications de plus de 24 h ; purge quotidienne de `cron.job_run_details` (7 jours).
- **Statut** : écrite, non exécutée.
