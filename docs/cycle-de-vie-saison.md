# Cycle de vie d'une saison — « انطلاق موسم جديد »

> Contexte de référence pour Mashrou3App. Décisions et implémentation du 2026-10-04.
> Migrations concernées : `0105` → `0109`.

---

## 1. Règle métier

Le lancement d'une nouvelle saison (type **regular** ou **summer**) est un **reset global** :
toutes les données liées aux saisons précédentes sont supprimées, quel que soit leur type.

| Supprimé | Conservé |
|---|---|
| Comptes superviseurs (+ `supervisor_invitations`) | Profils membres (deviennent **non inscrits**) |
| `seances`, `inscriptions`, `presences`, `presence_rappels` | `progression` (position réelle dans le Coran) |
| `member_applications` (tous kinds / statuts) | Lignes `saisons` (passées `active = false`) |
| `tests`, `test_dates`, `test_invitations` (notes comprises) | `season_stats` (statistiques des saisons passées) |
| `alerts`, `alert_acknowledgments` | |
| `chat_groups`, `chat_group_members`, `chat_group_messages`, `chat_group_reads`, `messages` | |
| `objectifs`, `member_programs` | |
| `notifications` | `season_member_stats` (historique par membre, jamais purgé) |

Profils mixtes membre + superviseur : le rôle `supervisor` est retiré, le compte et ses données membre sont conservés.
Profils admin : jamais touchés.

---

## 2. Flux côté Admin (`AdminNewSeasonScreen.js`)

1. Formulaire : **type** (« موسم عادي » par défaut / « مدرسة صيفية », via `SEASON_TYPE_LABELS`), nom, date (`YYYY-MM-DD` ou `YYYY/M/D`, convertie), version ≥ 1.
2. Modal de confirmation : liste de ce qui sera supprimé / conservé.
3. « تأكيد الانطلاق » → **ressaisie du mot de passe** (`verifyCurrentPassword`, `auth.js`) :
   - e-mail lu via `supabase.auth.getUser()`, `signInWithPassword` direct (pas `signInWithEmailPassword`, qui déconnecte un compte inactif) ;
   - même utilisateur vérifié, `supabaseSession` mis à jour ;
   - 3 échecs → « تم إلغاء العملية بعد 3 محاولات فاشلة ».
4. `AppContext.startNewSeason` :
   1. RPC `start_new_season` : le snapshot v2 est calculé **dans la transaction**, avant tout `DELETE` (`0124`). Le client n'écrit plus de snapshot et ne vérifie plus sa fraîcheur.
   2. suppression de chaque superviseur via l'Edge Function `delete-user` (boucle séquentielle, échecs collectés) → « تم حذف X من أصل Y مشرفين » ;
   3. rechargement de l'état (saisons, registrations, notifications, users).

L'ancien écran `AdminSummerSchoolScreen` est **obsolète et non routé** : il contourne le reset, ne pas le rebrancher.

---

## 3. RPC `public.start_new_season` (migrations `0105`, puis `0106`, corps repris par `0124`, puis par `0130`)

- Signature : `(p_name text, p_start_date date, p_version integer, p_type text default 'regular')`.
- `SECURITY DEFINER`, `search_path = ''`, `revoke` public/anon, `grant` authenticated.
- **Transactionnelle** : tout ou rien.

Ordre (imposé par les FK et les triggers) :

| # | Étape |
|---|---|
| 0 | Garde-fous : `private.is_admin()` + prédicat 0097 (role / roles), entrées valides, `p_type in ('regular','summer')`, `pg_advisory_xact_lock`, puis `snapshot_season` pour chaque saison active et pour chaque saison close encore peuplée de séances sans ligne `season_stats`. Plus de contrôle des 15 minutes. `season_stats` et `season_member_stats` ne sont pas purgées (`0124`) |
| 1 | `member_applications` (avant `seances` : FK `SET NULL` → triggers guard/notify) |
| 2 | `supervisor_invitations` |
| 3 | `test_invitations` → `test_dates` → `tests` |
| 4 | `alert_acknowledgments`, `alerts`. `0130` retire `alert_reads`, `alerte_accuses` et `alertes` : ces tables sont supprimées, la RPC ne les vide plus |
| 5 | groupes de chat puis `messages` (FK `messages → profiles` sans `ON DELETE`) |
| 6 | `objectifs`, `member_programs` |
| 7 | `presences`, `presence_rappels`, `inscriptions`, puis `seances` (avant les superviseurs) |
| 8 | `saisons` actives → `active = false`, `registration_open = false` |
| 9 | Superviseurs purs → `account_status = 'inactive'` ; mixtes → retrait de `supervisor` |
| 10 | `notifications` (après tout ce qui peut en créer) |
| 11 | Insert de la nouvelle saison (`type = p_type`, `remote = (p_type = 'summer')`, inscriptions ouvertes) |
| 12 | Insert de l'alerte membres (« انطلاق موسم جديد » / « انطلاق المدرسة الصيفية ») → trigger 0085 → notifications + push |

Retour : `{ saison_id, supervisor_ids, chat_group_ids, counts }`.

La RPC ne fait **pas** de `DELETE` sur `auth.users` : `storage.objects` le bloque. La suppression des comptes passe par `delete-user` côté client.

---

## 4. Statistiques

Détail du calcul et du JSON : `docs/statistiques.md`.

- Depuis `0124`, le snapshot est calculé **côté serveur** dans `start_new_season` (`public.snapshot_season`), dans la même transaction, avant les suppressions. La règle des 15 minutes est supprimée.
- `season_stats` et `season_member_stats` sont conservés. Une saison close n'est pas recalculée par un snapshot ultérieur.
- Dérogation unique (`0125`) : les saisons closes dont `avg_progress_pct = 0` alors que `progression` contient leur `saison_id` voient **seulement** le bloc progression réécrit (`details.rattrapage.source = 'progression'`). `snapshot_at` et `schemaVersion` ne bougent pas.
- Le client n'appelle que `compute_season_stats` pour la saison active. Une saison close est lue depuis `season_stats`. Aucun écran ne propose de recalcul.
- Tri de la position courante : `date desc, id desc` (jamais `date_saisie`).

---

## 5. Programmes (`member_programs`, migration `0107`)

- Un programme appartient à une saison et garde sa propre durée (pas de contrainte entre `start_date` du programme et de la saison).
- `saison_id text NOT NULL`, FK `saisons(id) ON DELETE RESTRICT`, **sans valeur par défaut**.
- `start_date` en `date` ; index `(membre_id, saison_id)`.
- Trigger `member_programs_require_active_season` (BEFORE INSERT/UPDATE) :
  - `saison_id` nul → « يرجى تحديث التطبيق إلى آخر إصدار » (ancienne version de l'app) ;
  - saison non active → « لا يوجد موسم نشط حالياً ».
- Client : envoie `saison_id` = saison active, lit uniquement les programmes de la saison active.
- **La synchronisation montante est supprimée** : un distant vide vide le cache local (plus de réinsertion du cache ni du seed).

---

## 6. Progression (migration `0108`)

Colonnes réelles : `id uuid`, `membre_id`, `saison_id text`, `date timestamptz`, `nb_hizb_completes`, `tumun_courant`, `notes`, `date_saisie date`. Pas de `created_at`.

- **Position actuelle** = dernière ligne du membre, **toutes saisons confondues**, tri `date desc, id desc` (`getCurrentProgressPosition` / `getMyCurrentProgressPosition`).
  Utilisée par : anneau et carte التقدم (membre), fiche admin/superviseur, préremplissage de « حفظ الموضع », base des ± ثمن, annuaire, stats.
- Restent filtrés par saison : rythme « هذا الموسم », « آخر التسجيلات », historique superviseur.
- `saison_id` écrit = saison active (tout type).
- Trigger `progression_require_active_enrollment` (BEFORE INSERT/UPDATE) : sans inscription `accepte` dans une saison active → « لا يمكن تسجيل التقدم قبل التسجيل في الموسم الحالي ».
- Client : crayon, « حفظ الموضع » et ± ثمن hifz désactivés pour un membre non inscrit.

---

## 7. Objectifs (migration `0109`)

- Trigger `objectifs_require_active_enrollment` (BEFORE INSERT/UPDATE) : inscription `accepte` requise **dans cette saison** (`saison_id = new.saison_id`) et saison active → sinon « لا يمكن تحديد الهدف قبل التسجيل في الموسم الحالي ».
- Client (`MemberProgressScreen`) : champ en lecture seule et « حفظ الهدف » désactivé sans inscription ; la valeur existante reste visible.
- Objectif suggéré : uniquement depuis la demande de la saison active (`form_answers.seasonGoal`, puis `hifz_amount` de la demande). Plus de repli sur `profiles.hifz_amount`.

---

## 8. Profil membre après le reset (même rendu côté membre et admin)

| Bloc | Source | Affichage sans inscription |
|---|---|---|
| المعلومات الشخصية | `profiles` (téléphone, école, niveau, genre, naissance copiés par `sync_profile_from_member_application`) | Inchangé, modification conservée |
| الحصة | inscription `accepte` dans une saison active (tout type) | membre « لم يتم تعيينك في حصة بعد » / admin « لم يتم تعيينه في حصة بعد » ; pas de ligne المشرف ni تاريخ التسجيل |
| التقدم | position actuelle (toutes saisons) | Position réelle, **lecture seule** |
| الحضور | `presences` de la séance | « لا يوجد سجل حضور بعد » (pas de 0 %) |
| Objectif (anneau) | `objectifs` | « — » + « لم يُحدد هدف لهذا الموسم بعد » |

- « تاريخ التسجيل » = `inscriptions.date_inscription` de la saison active uniquement (jamais `profiles.created_at`).
- « Inscrit » = au moins une inscription `accepte` dans une saison `active = true`, quel que soit le type — même règle côté membre (`getMyActiveEnrollment`) et admin (`getMemberActiveEnrollment`, `loadCurrentMemberSeance`).
- Annuaire admin : après reset, tous les membres sont « غير مسجّلين » (correct) ; l'onglet ouvert par défaut est le premier non vide.
- Cache `registrations` : une liste distante vide remplace le cache local (ancien cache gardé seulement en cas d'erreur réseau).

---

## 9. Lectures dépendant du type de saison

- `getActiveRegularSeason` : regular active, sinon la saison active restante.
- `resolveActiveRegularSaisonIdFromDb` (`alertsApi.js`) : saisons actives uniquement, jamais une saison inactive.
- `AdminRegistrationsScreen` : type par défaut = type de la saison active.
- `MemberRegistrationPanel` : si seule l'école d'été est ouverte, la carte regular affiche « لا يوجد موسم عادي مفتوح ».

---

## 10. Formulaires d'inscription (textes)

- Supprimé : « الحصص المعروضة حسب جنسك — يضيفها المشرف العام فقط » et « الحصص المعروضة حسب الجنس الذي اخترته — يضيفها المشرف العام فقط ».
- « Aucune حصة » selon le genre : « لا توجد حصص للإناث في هذا الموسم بعد » / « لا توجد حصص للذكور في هذا الموسم بعد ».
- « يضيفها المشرف العام » retiré de tous les textes.
- Valeurs de genre : `ذكر` / `أنثى`.
- *(À vérifier : rapport d'implémentation de ce lot non relu.)*
- Audit disponible : les textes d'inscription sont au masculin ; adaptation masculin/féminin envisagée via un helper `phrase(genre, masculin, féminin)` (repli masculin), non implémentée.

---

## 11. Migrations

| Fichier | Objet | Statut |
|---|---|---|
| `0105_start_new_season.sql` | RPC reset (3 args) | Exécutée, remplacée par 0106 |
| `0106_start_new_season_type.sql` | RPC avec `p_type` | Exécutée |
| `0107_member_programs_saison.sql` | `saison_id` sur `member_programs` + trigger | Exécutée après le reset |
| `0108_progression_require_enrollment.sql` | Verrou progression | Exécutée |
| `0109_objectifs_require_enrollment.sql` | Verrou objectifs | À confirmer |
| `0121` → `0126` | `season_stats` versionnée, `season_member_stats`, calcul serveur, snapshot dans `start_new_season`, rattrapage progression, versionnement rétroactif de `genre` et de `inscriptions_membre_id_saison_id_key` | Écrites, à exécuter dans le SQL Editor |

Sauvegarde avant reset : schéma privé `backup_20261004` (copie des tables + `auth.users` / `auth.identities`). À supprimer après validation : `drop schema backup_20261004 cascade;`.

---

## 12. Leçons techniques

- **`pg_safeupdate`** est actif pour les appels PostgREST (RPC comprises) : tout `DELETE` / `UPDATE` sans `WHERE` est refusé. Purge totale → `where true`. Le SQL Editor (rôle `postgres`) ne l'active pas : un test à blanc dans l'éditeur ne le détecte pas.
- **Mots-clés SQL non qualifiables** : `extract(...)`, `current_date`, `current_timestamp` ne se préfixent **jamais** par `pg_catalog.`. `now()`, `hashtext()`, etc. le peuvent.
- `search_path = ''` dans une fonction s'applique aussi aux triggers qu'elle déclenche : vérifier `proconfig` des fonctions de trigger sans `search_path` propre.
- Un trigger `BEFORE` s'exécute avant les FK et les `CHECK` : un test avec des ids fictifs fonctionne.
- Le droit `EXECUTE` d'une fonction de trigger n'est pas vérifié au déclenchement.
- Test à blanc fiable : bloc `DO` qui simule l'admin (`set_config('request.jwt.claims', …)`), appelle la RPC, puis **lève une exception** contenant les résultats → tout est annulé, résultats visibles.
- Le SQL Editor exécute un script en une transaction : une erreur annule tout le fichier.
- Ne jamais deviner un nom de colonne : `information_schema.columns` d'abord (ex. `progression` n'a pas `created_at`).
- Plusieurs tables, triggers et fonctions existent en base mais pas dans `supabase/migrations/` (`season_stats`, `profiles_sync_roles`, `deactivate_supervisors_for_saisons`, `account_status`). `alertes`, `alerte_accuses` et `alert_reads` sont dans ce cas jusqu'à l'exécution de `0130`, qui les supprime.
- **Synchronisation montante** (« distant vide → pousser le cache local ») : à proscrire, elle annule les purges serveur.
- **Anciennes versions de l'app** : le serveur doit se protéger seul (colonnes `NOT NULL` sans défaut, triggers). Distribuer la nouvelle version **avant** d'accepter les réinscriptions.

---

## 13. Reste à faire

- Distribuer la nouvelle version aux membres, puis créer les حصص, inviter les مشرفين, accepter les réinscriptions.
- Vérifier : correction de l'import `ActivityIndicator`, lot des textes d'inscription, exécution de `0109`.
- Supprimer `backup_20261004` après quelques jours.
- Basse priorité :
  - synchronisation montante de `saisons` (`saisonsApi.js` 212–225) ;
  - code mort : `closeRegularSaisons`, `archiveSeancesForSaisonIds`, `deactivateSupervisorsForSaisons`, `AdminSummerSchoolScreen` et ses fonctions (`createSeason`, `announceRegistrationForm`, `setRegistrationOpen`, `activateSeason`) ;
  - migrations rétroactives pour les objets créés hors dépôt ;
  - avatars de groupes orphelins dans `chat-group-avatars` ;
  - adaptation masculin/féminin des textes d'inscription.
