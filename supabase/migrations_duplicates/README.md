# Migrations non lues par le CLI

Le CLI Supabase identifie une migration par le préfixe numérique (`0024`, `0071`, …).
Un seul fichier par numéro peut être enregistré dans `schema_migrations`.

Ces copies ont le **même numéro** qu’un autre fichier resté dans `migrations/`.
Le schéma live les a déjà reçues (SQL Editor, ou une ré-émission plus tard : 0068–0072).
Les laisser dans `migrations/` fait échouer `db push` :

```
duplicate key value violates unique constraint "schema_migrations_pkey"
Key (version)=(0024) already exists.
```

Ne pas les remettre dans `migrations/` et ne pas les ré-exécuter (surtout `0035_saisons.sql`).
