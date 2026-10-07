# Alertes (تنبيهات)

Pile retenue : `alerts` et `alert_acknowledgments`. Les notifications push
sont un canal à part (`notifications`, catégorie `alertes`). Migration
`0129` écrite, non exécutée.

## Tables utilisées

### `alerts`

Une ligne par alerte. Colonnes lues et écrites par l'application :

| Colonne | Rôle |
|---|---|
| `id` | `text`, sans défaut. L'admin envoie un UUID ; `start_new_season` envoie `gen_random_uuid()::text` |
| `title` | `text NOT NULL`. Écrasé par le trigger (voir plus bas) |
| `body` | `text NOT NULL` |
| `message` | `text`, nullable en base. L'application l'envoie toujours |
| `audience` | `text NOT NULL`, défaut `'all'`. Valeurs envoyées : `all`, `members`, `supervisors` |
| `target_user_id` | `uuid`, jamais envoyé par l'application |
| `created_by` | `uuid`, `auth.uid()` de l'admin |
| `created_at` | `timestamptz` |
| `saison_id` | `text`, sans clé étrangère |

Publiée en Realtime. Droits `authenticated` : `SELECT` et `INSERT`. Pas d'`UPDATE` ni de `DELETE`.

RLS constatée en base (2026-10-07), au-delà des migrations :

- `alerts_admin_all` : `private.is_admin()`
- `admin_insert` et `admin_select` : `public.is_admin()`
- `alerts_select_recipients` : `private.alert_targets_me(audience)`
- `alerts_user_select` : `all`, ou `user` avec `target_user_id`, ou `members` / `supervisors` / `admin` selon le rôle

Aucun filtre SQL par `saison_id` ni par inscription. Le filtre saison et date est dans `alertsApi.js`.

### `alert_acknowledgments`

Clé `(alert_id, member_id)`. `acknowledged_at`. L'accusé est un `INSERT` : `alert_id`, `member_id = auth.uid()`. Pas d'upsert.

RLS : l'admin voit tout ; chacun lit les siens ; l'insert exige `member_id = auth.uid()` et `private.can_acknowledge_alert(alert_id)`. Un doublon `23505` est un succès côté client. Un refus RLS est une erreur.

`private.alert_targets_me` (`0026`) est vrai pour `all`, pour `members` si le rôle membre est présent, pour `supervisors` si le rôle superviseur est présent. Il est faux pour `user` et `admin`. `can_acknowledge_alert` passe par cette fonction : une alerte `user` ou `admin` ne peut pas être acquittée.

## Fonctions et triggers

| Objet | Où |
|---|---|
| `public.send_alert(text, text, text)` | `0066`. Admin, audiences `all` / `members` / `supervisors`, `p_saison_id` défaut null. Conservée telle quelle |
| `public.send_alert(text, text)` | `0066`. Retirée par `0129` (non exécutée) |
| `private.notify_alerte_nouvelle` | `0085`, reprise par `0129` |
| trigger `notify_alerts_nouvelle` | `AFTER INSERT` sur `alerts` |
| `public.alerts_sync_legacy_columns` | `0022`. Avant insert ou update : `message` et `body` prennent le premier texte non vide, puis `title = left(message, 120)` |

Le chemin normal de l'admin est l'INSERT direct (`alertsApi.sendAlert`). La RPC n'est appelée que si l'INSERT échoue. Depuis ce lot, le repli passe toujours `{ p_message, p_audience, p_saison_id }`, `p_saison_id` pouvant être null.

## Flux

### Création

`AdminNotificationsScreen` : texte (500 caractères), pastilles membres et superviseurs. Les deux → `all`, une seule → `members` ou `supervisors`. `saison_id` = `getActiveRegularSeason`. Pas de modification ni de suppression.

`start_new_season` (`0124`, étape 12) insère :

```sql
insert into public.alerts (
  id, message, title, body, audience, created_by, saison_id
) values (
  gen_random_uuid()::text,
  v_message,
  v_title,   -- v_title := v_message, puis le trigger tronque title à 120
  v_message,
  'members',
  auth.uid(),
  v_saison_id
);
```

École d'été : `v_message` commence par `انطلاق المدرسة الصيفية: «` + nom + `» — باب التسجيل مفتوح الآن…`. Saison ordinaire : `انطلاق موسم جديد: «` + nom.

### Diffusion

Le trigger crée une notification par profil `account_status = 'active'` visé. Titre fixe `تنبيه جديد من الإدارة`, catégorie `alertes`, `event_type` `alerte_nouvelle`, `source_table` `alerts`, `source_id` = id de l'alerte. L'auteur est exclu. Les erreurs sont avalées (`raise notice`).

`0129` change uniquement l'ordre du corps : `message`, puis `body`, puis `title`. Le push porte alors le message complet.

L'inbox (`listMyNotifications`) exclut la catégorie `alertes`. Le tap ne navigue pas vers `source_id`.

### Gate

`BlockingAlertGate` (`App.js`) est une modale au-dessus du navigateur. Le retour Android ne la ferme pas (`onRequestClose` vide).

Chargement : montage (dès que la session est connue, donc aussi quand l'application tuée est rouverte), retour au premier plan, Realtime `INSERT`, poll 30 s, et l'événement `alertGate:refresh`.

File : alertes non acquittées, plus anciennes d'abord, puis filtre saison + date d'inscription. Échec de lecture : la file n'est pas remplacée (fail-open). L'admin ne charge pas et ne voit pas la modale.

Texte affiché : `message`, sinon `body`, sinon `title`.

### Accusé

Bouton unique monté : `تمت القراءة`, dans le gate. Pendant l'envoi le bouton est désactivé et un indicateur tourne. Si l'INSERT échoue (hors `23505`, déjà traité comme succès dans `acknowledgeAlert`), la modale reste et affiche `تعذّر تسجيل الاطلاع، يرجى المحاولة مرة أخرى`. Le texte d'erreur est effacé au prochain appui.

Un compte qui a plusieurs rôles n'a qu'une ligne `(alert_id, member_id)`.

### Tap push

`notificationNavigation` : si `event_type` vaut `alerte_nouvelle`, émettre `alertGate:refresh`, puis le comportement précédent (marquer la notification lue, ouvrir `NotificationDetail`). La modale passe devant si l'alerte est encore dans la file.

Application tuée : `BlockingAlertGate` n'est monté qu'après l'hydratation de `AppProvider`, et son effet de montage appelle le même chargement dès que `supabaseSession.user.id` est connu. L'événement du tap arrive ensuite (rejeu `getLastNotificationResponseAsync`, puis attente de l'écran `NotificationDetail`). Les deux chargements se recouvrent ; aucun émetteur supplémentaire après hydratation n'est nécessaire.

## Décisions métier (oct. 2026)

- Une seule saison active à la fois. `getActiveRegularSeason`, `resolveActiveRegularSaisonIdFromDb` et `pickDisplayedActiveSeason` ne changent pas.
- Le membre non inscrit reste bloqué par l'alerte de lancement (`sinceIso` null → les alertes de la saison restent).
- Une alerte antérieure à la date d'inscription (ou d'activation) reste invisible.
- Pas de remplacement automatique, pas d'expiration, pas de ciblage par séance.
- Échec de lecture de la file : pas de blocage.
- Libellé d'accusé : `تمت القراءة`.

## Migration `0129`

Fichier `supabase/migrations/0129_alerts_send_alert_et_corps_notification.sql`. Non exécutée.

1. `drop function if exists public.send_alert(text, text)`.
2. `create or replace` de `private.notify_alerte_nouvelle` : même corps que `0085`, coalesce du corps en `message` → `body` → `title`.
3. `alerts_sync_legacy_columns`, les policies et les tables `alertes` / `alerte_accuses` / `alert_reads` ne sont pas touchés par `0129`. Leur suppression est `0130` (écrite, non exécutée).

## Hors périmètre

- `alertes`, `alerte_accuses` et `alert_reads` : aucun `CREATE` versionné, aucun appel client. `0130` les supprime et retire leurs `DELETE` de `start_new_season`. La catégorie `notifications.category = 'alertes'` reste.
- Policies `admin_insert`, `admin_select`, `alerts_user_select`, et la colonne `target_user_id` : présentes en base, absentes de `supabase/migrations/`.
- Le `CHECK` d'audience versionné (`0014`, `0020`) ne contient que `all`, `members`, `supervisors`. Le `CHECK` vivant accepte aussi `user` et `admin`. L'application n'envoie pas ces deux valeurs.
- Formulation de l'école d'été : si la saison s'appelle `المدرسة الصيفية`, le texte devient `انطلاق المدرسة الصيفية: «المدرسة الصيفية» — …`. Le modèle de `0124` n'est pas modifié.
- `AppContext.notifications` (AsyncStorage `@mashrou3/app_state_v3`) n'est pas la table `alerts`. `AppContext.sendAlert`, qui y écrivait une fausse alerte, a été retiré. Le reste de ce cache reste.

## Leçons

- Deux surcharges PostgREST qui partagent les noms d'arguments sont ambiguës dès qu'un appel omet un argument qui a une valeur par défaut. Un seul appel à trois arguments nommés lève l'ambiguïté.
- `title` n'est pas un titre : le trigger le recolle sur le début du message. Le push doit lire `message`.
- Le gate et la notification ne voient pas la même population. Le trigger notifie tout profil actif du rôle. Le client retire ensuite la mauvaise saison et toute alerte antérieure à l'inscription. Un push peut donc arriver sans modale.
- Marquer la notification lue n'écrit pas dans `alert_acknowledgments`.
- L'accusé refusé doit rester visible : un échec silencieux laissait la modale sans explication, et le seul bouton monté est celui du gate.
