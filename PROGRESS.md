- Liste du chat admin : règles D1–D5, filtre, badge et rechargement — voir [docs/chat.md](docs/chat.md).

## Alertes — oct. 2026

Stack, flux, décisions et migration `0129` (écrite, non exécutée) : [docs/alertes.md](docs/alertes.md).

## Écarts au CdC

- Alertes : stack legacy `alerts` / `alert_acknowledgments` retenue. Modèle `alertes` / `alerte_accuses` abandonné.

## DB cleanup

`0130_drop_tables_mortes.sql` est écrite, non exécutée. Elle supprime, sans `CASCADE` : `attendance_records`, `attendance_sessions`, `exam_participants`, `exams`, `group_members`, `member_progress`, `groups`, `seasons`, `alerte_accuses`, `alertes`, `alert_reads`, `invitations`. `activation_codes` reste. `start_new_season` (corps de `0124`) ne vide plus `alert_reads`, `alerte_accuses` ni `alertes`. Le client ne lit pas ces clés de `counts`.

`0131_push_dispatch_sans_boucle_et_purge_cron.sql` est écrite, non exécutée. Elle arrête la réécriture cron de `dispatch_request_id`. Détail : [docs/nettoyage-bdd.md](docs/nettoyage-bdd.md).

## Départ de saison calculé — oct. 2026

`0135_progression_depart_calcule.sql` et `0136_tumun_courant_0_7.sql` sont écrites, non exécutées. `0135` : le départ de la saison est calculé par le serveur (`get_member_season_progress`, stats). `objectifs.nb_hizb_depart` n'est plus lu ni écrit. `0136` : contrainte `tumun_courant` 0–7 et 60 حزب → ثمن 0, sans conversion de données. Détail : [docs/statistiques.md](docs/statistiques.md), [docs/cycle-de-vie-saison.md](docs/cycle-de-vie-saison.md) §6–7.

`0137_objectifs_require_position.sql` est écrite, non exécutée : un objectif ne peut être créé que si le membre a une position (départ de saison connu). Détail : [docs/cycle-de-vie-saison.md](docs/cycle-de-vie-saison.md) §7.

Prochain numéro libre : `0138`.

## Reste à faire

Basse priorité :

- deux fichiers `0128` en doublon à renuméroter (`0128_messages_rg6_admin_membre.sql` et `0128_progression_relance_copy.sql`) ;
- `0129_alerts_send_alert_et_corps_notification.sql` écrite mais non exécutée.
