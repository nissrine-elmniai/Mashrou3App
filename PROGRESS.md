- Liste du chat admin : règles D1–D5, filtre, badge et rechargement — voir [docs/chat.md](docs/chat.md).

## Alertes — oct. 2026

Stack, flux, décisions et migration `0129` (écrite, non exécutée) : [docs/alertes.md](docs/alertes.md).

## Écarts au CdC

- Alertes : stack legacy `alerts` / `alert_acknowledgments` retenue. Modèle `alertes` / `alerte_accuses` abandonné.

## DB cleanup

`0130_drop_tables_mortes.sql` est écrite, non exécutée. Elle supprime, sans `CASCADE` : `attendance_records`, `attendance_sessions`, `exam_participants`, `exams`, `group_members`, `member_progress`, `groups`, `seasons`, `alerte_accuses`, `alertes`, `alert_reads`, `invitations`. `activation_codes` reste. `start_new_season` (corps de `0124`) ne vide plus `alert_reads`, `alerte_accuses` ni `alertes`. Le client ne lit pas ces clés de `counts`.

## Reste à faire

Basse priorité :

- deux fichiers `0128` en doublon à renuméroter (`0128_messages_rg6_admin_membre.sql` et `0128_progression_relance_copy.sql`) ;
- `0129_alerts_send_alert_et_corps_notification.sql` écrite mais non exécutée.
