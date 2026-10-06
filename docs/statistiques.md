# Statistiques de saison

Calcul et stockage côté base (`0121` à `0126`). L'écran admin lit ce contrat :
saison active via `compute_season_stats`, saison close via la ligne `season_stats`.
L'application n'écrit ni dans `season_stats` ni dans `season_member_stats`,
et n'appelle ni `snapshot_season` ni `compute_season_member_stats`.

## Tables

### `season_stats`

Une ligne par saison (`saison_id` clé primaire, FK `saisons(id) ON DELETE CASCADE`).

Colonnes scalaires, remplies à chaque snapshot :

| Colonne | Contenu |
|---|---|
| `members_total` | `effectifs.membres` |
| `members_male` / `members_female` | `effectifs.male` / `effectifs.female` |
| `seances_total` | nombre d'objets `bySeance` |
| `supervisors_total` | nombre d'objets `bySupervisor` |
| `avg_progress_pct` | `progression.avgPositionPct`, ou `0` si null |
| `avg_presence_pct` | `presence.pct`, ou `0` si null |
| `details` | JSON décrit plus bas |
| `snapshot_at` | `now()` au moment du snapshot |
| `updated_at` | `now()` au moment du snapshot |

`created_at` n'est pas réécrit lors d'un upsert.

Lecture et écriture : `private.is_admin()` seulement
(`season_stats_admin_all`). Aucun écran non-admin ne lit cette table.
L'ancienne policy `season_stats_select_authenticated` est supprimée.

### `season_member_stats`

Une ligne par `(saison_id, membre_id)`.

- `seance_id` et `superviseur_id` n'ont pas de clé étrangère : les séances et les comptes superviseurs sont supprimés au reset. `seance_nom` et `superviseur_nom` sont des copies.
- `source` : `snapshot` (figé par `snapshot_season`) ou `rattrapage` (migration `0125`).
- Positions en **tumun**, de 0 à 480 : `nb_hizb_completes × 8 + tumun_courant`, plafonné à 480. `tumun_courant` null compte comme 0. `nb_hizb_completes` null : pas de position.
- RLS : policy ALL `private.is_admin()`.

## Qui calcule

| Fonction | Rôle |
|---|---|
| `private.is_admin()` | Déjà définie (migration `0026`). Vrai si `roles[]` contient `admin` lorsque ce tableau est non vide, sinon si `role = 'admin'`. Pas de `public.is_admin()`. |
| `public.compute_season_stats(text)` | JSON v2, aucune écriture. `stable`, `security definer`. |
| `public.compute_season_member_stats(text)` | Une ligne par membre `accepte`. |
| `public.snapshot_season(text)` | Upsert `season_stats`, puis remplacement des lignes `season_member_stats` de la saison. |

Les trois fonctions publiques lèvent `هذه العملية للمشرف العام فقط` si l'appelant n'est pas admin.

Droits d'exécution : seule `compute_season_stats` est exposée à l'application (`EXECUTE` pour `authenticated`). `compute_season_member_stats` et `snapshot_season` ne le sont pas. Elles sont appelées depuis `compute_season_stats` et `start_new_season`, toutes deux `security definer` : l'appel se fait avec les droits du propriétaire, et `auth.uid()` reste celui de l'appelant, donc `private.is_admin()` s'applique toujours.

`snapshot_season` refuse de recalculer une saison close qui a déjà une ligne `season_stats` (`لا يمكن إعادة حساب إحصائيات موسم مغلق`). Une saison close sans snapshot peut encore être figée une fois.

Dans le SQL Editor, `auth.uid()` est null : poser d'abord

```sql
select set_config(
  'request.jwt.claims',
  '{"sub":"<UUID_ADMIN>","role":"authenticated"}',
  true
);
```

## Règles de calcul

Membres : une inscription `statut = 'accepte'` dont `inscriptions.saison_id` vaut la saison. La contrainte `inscriptions_membre_id_saison_id_key` (`UNIQUE (membre_id, saison_id)`, versionnée par `0126`) garantit une seule ligne : la séance du membre est `inscriptions.seance_id`, sans choix de « la plus récente ».

`membersCount` et `membersDistinct` d'un superviseur sont égaux, chaque membre n'ayant qu'une séance.

Toutes les séances de la saison comptent, quel que soit `statut` (`active` ou `archivee`).

Présence : marques `present` et `absent` du membre **sur la séance de son inscription**, pas la somme de plusieurs séances. Pourcentage `round(100 × présents / (présents + absents))`, **null** si le dénominateur est 0. `jours` = nombre de dates distinctes ayant au moins une de ces marques. Tranches de membres : `≥ 90`, `≥ 75 et < 90`, `≥ 50 et < 75`, `< 50`, sans marque.

Position de fin (snapshot normal) : dernière ligne `progression` du membre, **toutes saisons**, tri `date desc, id desc`. Jamais `date_saisie`.

Position de début : dernière ligne strictement antérieure à la première ligne de la saison (`date`, puis `id`) ; à défaut, cette première ligne ; à défaut, null.

Gain = fin − début, en tumun. `gainMoyenHizb` et `gainTotalHizb` = moyenne et somme des gains ÷ 8, arrondies au centième. Null s'il n'y a aucun gain.

Pourcentage de position = `least(100, round(100 × pos / 480))`. La moyenne `avgPositionPct` est la moyenne de ces pourcentages, arrondie. Null s'il n'y a aucune position. `khatm` = membres dont `pos_fin = 480`.

Tranches de juz (`parTranche`), d'après `pos_fin` : 1 juz = 16 tumun. `0-5` = `[0, 80)`, puis par pas de 80, `25-30` = `[400, 480]`. Les membres sans position n'entrent dans aucune tranche.

Courbe mensuelle : lignes `progression` dont `saison_id` est celui de la saison et `nb_hizb_completes` n'est pas null. Mois = `date` converti en `Africa/Casablanca` (`YYYY-MM`). Dernière ligne du membre dans le mois, puis moyenne des pourcentages. Les libellés arabes des mois restent côté client. `progressTimeline` est une copie de `progression.timeline` (clés `key`, `avgPct`, sans `label`).

Mois de présence : `to_char(presences.date, 'YYYY-MM')`. Le type de `presences.date` n'est pas créé dans `supabase/migrations/` (voir la requête de confirmation).

Genre : `seances.genre` de la séance de l'inscription, sinon `member_applications.genre` de la même `season_id` (ligne au `updated_at` le plus récent). Les deux colonnes sont versionnées par `0126`. Le profil n'est pas lu. `ذكر` / `أنثى` ; le reste est `nonSpecifie`.

Type de demande : `member_applications.kind` de la même saison, même règle de date. `join` → `nouveaux`, `season_renewal` → `renouvellements`. Un membre sans demande n'est dans aucun des deux.

`retires` est **null**. `inscriptions` ne garde que le statut courant (pas d'historique « accepté puis retiré »).

Demandes (`member_applications` de la saison) :

| Clé | Statuts |
|---|---|
| `recues` | toutes |
| `acceptees` | `invited`, `activated` |
| `refusees` | `rejected` |
| `enAttente` | `pending` |

`tauxAcceptation` = `round(100 × acceptées / (acceptées + refusées))`, null si aucune demande n'a été traitée.

Tests : tous les `tests` de la saison et toutes leurs `test_invitations`, y compris un membre qui n'est plus `accepte`. Une note compte si `statut = 'note'` et `note` n'est pas null. Barème unique 0–20 (`test_invitations_note_0_20`, migration `0090`) : tranches `0-5`, `5-10`, `10-15`, `15-20` (`15` inclus dans la dernière, `20` inclus). `parTest.date` = `min(test_dates.date_proposee)`. `tests.date_test` a été supprimée par `0090`.

Objectifs : seulement les membres `accepte` qui ont une ligne `objectifs` pour la saison. `nb_hizb_cible` et `nb_hizb_depart` sont des **hizb** (1–60 et 0–60, migrations `0057` et `0062`). Atteint si `(pos_fin ou 0) − nb_hizb_depart × 8 ≥ nb_hizb_cible × 8`. `taux` null s'il n'y a aucun objectif. `realisationMoyennePct` = moyenne, par objectif, de `100 × progression / (cible × 8)`, chaque ratio borné à `[0, 100]`, arrondie au centième. Null s'il n'y a aucun objectif.

Toute moyenne sans dénominateur est **null** dans le JSON, jamais 0. Les colonnes scalaires `avg_*_pct`, elles, stockent 0 quand le JSON est null (contrainte `NOT NULL`).

## Contrat JSON v2 (`details.schemaVersion = 2`)

Clés en camelCase. Les dates de saison (`start_date`, `end_date`, type `date` depuis `0042`) sont `saison.dateDebut` et `saison.dateFin`.

```json
{
  "schemaVersion": 2,
  "saison": { "id": "", "name": "", "type": "", "active": true, "dateDebut": null, "dateFin": null },
  "effectifs": {
    "membres": 0, "male": 0, "female": 0, "nonSpecifie": 0,
    "nouveaux": 0, "renouvellements": 0, "retires": null,
    "demandes": { "recues": 0, "acceptees": 0, "refusees": 0, "enAttente": 0 },
    "tauxAcceptation": null
  },
  "presence": {
    "pct": null, "present": 0, "absent": 0, "jours": 0,
    "parMois": [{ "key": "YYYY-MM", "pct": 0 }],
    "repartition": { "ge90": 0, "p75_90": 0, "p50_75": 0, "lt50": 0, "sansDonnees": 0 }
  },
  "progression": {
    "avgPositionPct": null, "membresAvecDonnees": 0,
    "gainMoyenHizb": null, "gainTotalHizb": null, "khatm": 0,
    "parTranche": [{ "key": "0-5", "count": 0 }],
    "timeline": [{ "key": "YYYY-MM", "avgPct": 0 }]
  },
  "tests": {
    "count": 0, "invites": 0, "notes": 0, "moyenne": null, "min": null, "max": null,
    "distribution": [{ "key": "0-5", "count": 0 }],
    "parTest": [{ "id": "", "titre": "", "date": null, "invites": 0, "notes": 0, "moyenne": null }]
  },
  "objectifs": { "fixes": 0, "atteints": 0, "taux": null, "realisationMoyennePct": null },
  "bySeance": [{
    "id": "", "name": "", "genre": "", "supervisorId": null, "supervisorName": null,
    "membersCount": 0, "membersMale": 0, "membersFemale": 0,
    "avgProgressPct": null, "presencePct": null, "presenceMarked": 0,
    "sessionCount": 0, "gainMoyenHizb": null
  }],
  "bySupervisor": [{
    "id": "", "name": null, "seancesCount": 0,
    "membersCount": 0, "membersDistinct": 0,
    "avgProgressPct": null, "avgPresencePct": null,
    "gainMoyenHizb": null, "joursTenus": 0
  }],
  "progressTimeline": [{ "key": "YYYY-MM", "avgPct": 0 }]
}
```

`bySeance` inclut les séances sans membre. `bySupervisor` inclut les superviseurs de ces séances, même sans membre. Une séance sans `superviseur_id` n'y figure pas.

## Compatibilité v1

Les snapshots déjà en base n'ont pas `schemaVersion`. Leurs clés utiles à l'écran actuel sont notamment `bySeance`, `bySupervisor`, `progressTimeline[].label`, `tests.count` / `gradedCount` / `averageNote`, `objectifs.fixedCount` / `achievedCount` / `achievementRate`.

Un snapshot v2 :

- garde `bySeance` et `bySupervisor` (avec des champs en plus, et `null` au lieu de `0` pour une moyenne vide) ;
- garde `progressTimeline`, **sans** `label` ;
- range tests et objectifs sous les clés v2 (`tests.notes`, `objectifs.fixes`, etc.).

L'écran admin normalise v1, v1 rattrapé et v2 vers un même modèle. Un bloc absent s'affiche « غير متوفر لهذا الموسم ». Les libellés de mois sont générés côté client depuis `YYYY-MM`. Une moyenne de progression à 0 sans courbe n'est pas affichée (bug historique).

## Snapshot dans `start_new_season`

Avant tout `DELETE`, pour chaque saison active (regular et summer), puis pour chaque saison close qui a encore des séances et aucune ligne `season_stats` : `perform snapshot_season(id)`.

Une saison close qui a déjà un snapshot n'est pas passée à `snapshot_season`. La fonction elle-même refuse aussi ce cas, pour qu'un appel direct n'écrase pas un snapshot avec un recalcul vide. `season_stats` et `season_member_stats` ne sont pas dans la purge. Les lignes `saisons` ne sont pas supprimées (`active = false`), donc le `ON DELETE CASCADE` de la FK ne s'applique pas ici.

## Rattrapage `0125`

Une seule dérogation à « une saison close n'est jamais recalculée », limitée à la progression.

Cible : saison `active = false`, `avg_progress_pct = 0`, au moins une ligne `progression` de cette `saison_id`, `details.rattrapage.source` différent de `progression`, `schemaVersion` différent de `2`.

Différence avec le snapshot : la position de fin est la dernière ligne **de la saison**, pas la position toutes saisons (les inscriptions n'existent plus ; la position globale d'aujourd'hui mélangerait les saisons suivantes).

Écrit : `avg_progress_pct`, `details.progression` (bloc v2 complet), `details.progressTimeline`, `details.rattrapage = { "date", "source": "progression" }`. Ne change pas `schemaVersion` ni `snapshot_at`.

Insère les lignes membre (`source = 'rattrapage'`, seuls les champs de position, le reste à 0 ou null) avec `ON CONFLICT DO NOTHING`.

Relancer le fichier ne reprend pas une saison déjà marquée, ni une saison dont la moyenne n'est plus 0, ni un snapshot déjà en v2.
