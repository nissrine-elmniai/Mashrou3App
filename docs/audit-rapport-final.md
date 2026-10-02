# Audit Mashrou3App — rapport final (lecture seule)

Date de lecture : 2026-09-27. Périmètre : dépôt `Mashrou3App/` (racine applicative). Aucune migration ni écriture en base n’a été exécutée.

Sources utilisées : `package.json`, `package-lock.json`, `app.json`, `eas.json`, `supabase/migrations/*.sql`, `supabase/functions/`, `app/`.  
`PROGRESS.md` et `docs/db-schema-context.md` ne sont pas utilisés.

Le dossier `supabase/migrations_duplicates/` **n’est pas** la série appliquée par le CLI : `supabase/config.toml` ligne 64 a `schema_paths = []` (dossier par défaut `supabase/migrations/`). Tout objet dont le `CREATE` n’existe que dans `migrations_duplicates/` est marqué **NON TROUVÉ** dans la série officielle.

---

## 1. Inventaire

### 1.1 Versions

Déclarées dans `Mashrou3App/package.json`. Versions résolues dans `package-lock.json` quand elles coïncident.

| Paquet | `package.json` | Résolu (`package-lock.json`) |
|---|---|---|
| expo | `~54.0.37` (`package.json:20`) | `54.0.37` (`package-lock.json:4819`) |
| react-native | `0.81.5` (`package.json:33`) | `0.81.5` (`package-lock.json:8451`) |
| react | `19.1.0` (`package.json:32`) | `19.1.0` (`package-lock.json:8414`) |
| @supabase/supabase-js | `^2.110.9` (`package.json:19`) | `2.110.9` (`package-lock.json:3154`) |

Autres `dependencies` (`package.json:12-41`) :

| Paquet | Version déclarée |
|---|---|
| @expo-google-fonts/cairo | ^0.4.2 |
| @react-native-async-storage/async-storage | 2.2.0 |
| @react-native-community/datetimepicker | 8.4.4 |
| @react-native-picker/picker | ^2.11.1 |
| @react-navigation/native | ^7.1.28 |
| @react-navigation/stack | ^7.7.2 |
| expo-dev-client | ~6.0.21 |
| expo-device | ~8.0.10 |
| expo-font | ~14.0.12 |
| expo-image-manipulator | ~14.0.8 |
| expo-image-picker | ~17.0.11 |
| expo-linear-gradient | ~15.0.8 |
| expo-linking | ~8.0.12 |
| expo-notifications | ^0.32.17 |
| expo-status-bar | ~3.0.9 |
| expo-updates | ~29.0.20 |
| lucide-react-native | ^0.576.0 |
| react-native-gesture-handler | ~2.28.0 |
| react-native-paper | ^5.15.0 |
| react-native-safe-area-context | ~5.6.0 |
| react-native-screens | ~4.16.0 |
| react-native-svg | 15.12.1 |
| react-native-url-polyfill | ^4.0.0 |
| react-native-vector-icons | ^10.3.0 |

`devDependencies` (`package.json:43-47`) : `@types/react` ~19.1.10, `dotenv` ^17.4.2, `typescript` ~5.9.2.  
Nom du paquet : `mashrou3app` version `1.0.0` (`package.json:2-3`). Scripts : `start`, `android`, `android:dev`, `ios`, `web` uniquement (`package.json:5-10`). Pas de script `test` ni `lint`.

### 1.2 `app.json` et `eas.json`

`app.json` :

- nom affiché : `مهندس حامل لكتاب الله` (`app.json:3`)
- slug : `Mashrou3App` (`app.json:4`)
- scheme : `mashrou3app` (`app.json:5`)
- version : `1.0.0` (`app.json:6`)
- iOS `bundleIdentifier` : `com.clubaltruisme.mashrou3app` (`app.json:18`)
- Android `package` : `com.clubaltruisme.mashrou3app` (`app.json:33`)
- owner : `oumeyma_elaammari` (`app.json:73`)
- EAS `projectId` : `169c3088-003d-4709-9727-dfc55f44d6ef` (`app.json:54`)

`eas.json` profils de build (`eas.json:6-25`) :

| Profil | distribution | channel | android |
|---|---|---|---|
| development | internal | development | apk, `developmentClient: true` |
| preview | internal | preview | apk |
| production | (défaut store) | production | `autoIncrement: true` |

CLI : `>= 16.32.0`, `appVersionSource: remote` (`eas.json:2-4`). Submit : profil `production` vide (`eas.json:27-29`).

### 1.3 Migrations

**88 fichiers** dans `supabase/migrations/` (0001 à 0088, un fichier par numéro).

**Préfixes numériques dupliqués dans `supabase/migrations/` : aucun.** Chaque préfixe `0001`–`0088` apparaît une fois.

Hors série (non appliquée par le dossier `migrations/`) : `supabase/migrations_duplicates/` reprend des préfixes déjà utilisés (`0024` … `0072`). Le fichier officiel `0070_member_programs_type.sql` lignes 1-2 le dit explicitement : « le préfixe 0047 était partagé par 4 fichiers ». Ces copies ne font pas partie du décompte ci-dessus.

### 1.4 Git

Dépôt lu dans `Mashrou3App/` (`git rev-list --count HEAD` = **229**).

| Extrémité | Commit | Date | Auteur |
|---|---|---|---|
| Premier (`git log --reverse`) | `4d6c03057e5b3a3ed7ba57718a678b716374a1b4` | 2026-02-11T14:19:53+01:00 | NissrineELMNIAI \<nissrineelmniai0@gmail.com\> — « Created a new Expo app » |
| Dernier (`git log -1`) | `0aebf6b8a8a72d1094d59014fb2aea509cf84edc` | 2026-09-27T14:54:16Z | oumeyma-elaammari \<oumeyma.elaammari.ensao@ump.ac.ma\> — « msg » |

`git shortlog -sn HEAD` :

| Commits | Auteur (tel que Git) |
|---|---|
| 71 | Lamyae HAMDAOUI |
| 58 | oumeyma-elaammari |
| 49 | NissrineELMNIAI |
| 41 | EL AAMMARI OUMEYMA |
| 8 | EL AAMMARI Oumeyma |
| 2 | Nissrine EL MNIAI |

### 1.5 Écrans et modules `app/lib`

**`app/screens/admin/`** (15) : `AdminChatScreen.js`, `AdminDashboard.js`, `AdminGroupsScreen.js`, `AdminMembersScreen.js`, `AdminNewSeasonScreen.js`, `AdminNotificationsScreen.js`, `AdminProfileScreen.js`, `AdminRegistrationsScreen.js`, `AdminSeanceDetailScreen.js`, `AdminSeasonsScreen.js`, `AdminStatsScreen.js`, `AdminSummerSchoolScreen.js`, `AdminSupervisorDetailScreen.js`, `AdminSupervisorsScreen.js`, `AdminTestsScreen.js`.

**`app/screens/supervisor/`** : `ChatConversationScreen.js`, `MemberProfileScreen.js`, `SupervisorAlertsScreen.js`, `SupervisorAttendanceDetailScreen.js`, `SupervisorAttendanceScreen.js`, `SupervisorDashboard.js`, `SupervisorHomeScreen.js`, `SupervisorLoginScreen.js`, `SupervisorMembersScreen.js`, `SupervisorMessagesScreen.js`, `SupervisorProfileScreen.js`, `SupervisorProgressScreen.js`, plus `supervisorHelpers.js`, `supervisorProgressHelpers.js`, `supervisorAttendanceHelpers.js`, `supervisorAttendanceBridge.js`, `hooks/useSupervisorActivity.js`, `hooks/useSupervisorMembers.js`, `components/SupervisorWidgets.js`, `components/BroadcastMessageModal.js`.

**`app/screens/member/`** : `MemberAlertsScreen.js`, `MemberChatInboxScreen.js`, `MemberDashboardScreen.js`, `MemberProfileScreen.js`, `MemberProgramsPanel.js`, `MemberProgressScreen.js`, `MemberRegistrationPanel.js`, `ProgrammeDetailsScreen.js`.

**Racine `app/screens/`** (hors admin/supervisor/member) : `ActivateAccountScreen.js`, `ForgotPasswordScreen.js`, `LoginScreen.js`, `RegisterScreen.js`, `ResetPasswordScreen.js`, `chat/GroupChatScreen.js`, `chat/GroupInfoScreen.js`, `notifications/NotificationDetailScreen.js`, `notifications/NotificationInboxScreen.js`, `notifications/NotificationSettingsScreen.js`, `notifications/UnifiedInboxScreen.js`.

**`app/lib/*.js`** (27) : `alertsApi.js`, `auth.js`, `authEmail.js`, `authLinking.js`, `avatarApi.js`, `avatarPicker.js`, `chatGroupsApi.js`, `edgeFunctionError.js`, `memberApplicationsApi.js`, `memberProgramsApi.js`, `membersApi.js`, `messagesApi.js`, `notificationNavigation.js`, `notificationsApi.js`, `objectifsApi.js`, `presenceApi.js`, `progressApi.js`, `pushNotifications.js`, `saisonsApi.js`, `seancesApi.js`, `seasonScope.js`, `seasonStatsApi.js`, `supervisorActivityApi.js`, `supervisorInvitationsApi.js`, `supabase.js`, `testsApi.js`, `tumun.js`.

### 1.6 Edge Functions

| Fonction | Rôle | Contrôle d’autorisation |
|---|---|---|
| `send-push` | Envoie les push Expo (`EXPO_PUSH_URL`, `send-push/index.ts:16`) | Bearer comparé à `SUPABASE_SERVICE_ROLE_KEY` (`index.ts:4-5`, `63-68`). Pas de rôle utilisateur. Commentaire : appel pg_net / cron. |
| `activate-invited-account` | Crée le compte Auth invité sans `signUp` SMTP | Commentaire de déploiement `--no-verify-jwt` (`index.ts:6`). Pas de JWT appelant. Garde métier : `member_applications.status = invited` ou `supervisor_invitations.status = pending` (`index.ts:8-9`, `97-116`). Écrit avec `service_role` (`index.ts:91-92`). Rate-limit mémoire 8 / 15 min (`index.ts:21-22`). |
| `send-password-reset` | OTP recovery via `auth.admin.generateLink` | Commentaire `--no-verify-jwt` (`index.ts:3`). Aucun `getUser`. Client `service_role` (`index.ts:52-57`). Réponse neutre si l’e-mail est inconnu (`index.ts:62-65`). Rate-limit mémoire 3 / 15 min (`index.ts:14-15`). |
| `send-app-email` | E-mail transactionnel | JWT : `auth.getUser()` (`index.ts:35-38`) puis `profiles.role` ∈ {`admin`, `supervisor`} (`index.ts:45-56`). |
| `delete-user` | Suppression Auth d’un autre compte | JWT `getUser` (`index.ts:51-54`) puis `profiles.role === 'admin'` (`index.ts:66-67`). Suppression via `service_role` (`index.ts:79-80`). Refuse l’auto-suppression (`index.ts:75-77`). |
| `auth-redirect` | Page HTML vers `mashrou3app://reset-password` | Commentaire `--no-verify-jwt` (`index.ts:2`). Pas de contrôle de rôle : redirection publique. |
| `_shared/sendMail.ts` | Envoi SMTP / Resend | Pas une fonction HTTP. `Authorization: Bearer` vers l’API Resend (`sendMail.ts:94`), pas un contrôle d’accès applicatif. |

---

## 2. Migrations (ordre lexicographique)

Objet = titre du fichier / en-tête SQL. Tables = celles créées, altérées, ou dont une policy/trigger est posée dans ce fichier.

| Fichier | Objet | Tables touchées |
|---|---|---|
| 0001_baseline.sql | Profils + demandes d’inscription | profiles, member_applications |
| 0002_seances.sql | Séances | seances |
| 0003_inscriptions.sql | Inscriptions + index unique partiel membre accepté | inscriptions |
| 0004_progression.sql | Progression (schéma juze/tumun) | progression |
| 0005_tests.sql | Tests, invitations, résultats | tests, test_invitations, test_resultats |
| 0006_messages.sql | Messages 1-à-1 + `private.messages_pair_authorized` | messages |
| 0007_member_applications_auto_affectation.sql | Trigger d’affectation auto | member_applications |
| 0008_profiles_rls_lecture.sql | Policies de lecture profiles | profiles |
| 0009_fix_rls_recursion.sql | Réécriture RLS via `private.*` | profiles, seances, inscriptions, progression, tests, test_invitations, test_resultats, member_applications |
| 0010_fix_seances_profiles_fk.sql | FK superviseur / membre | seances, progression |
| 0011_fix_inscriptions_select_own_member.sql | Restaure la lecture membre | inscriptions |
| 0012_tests_statut.sql | Colonne `tests.statut` | tests |
| 0013_supervisor_invitations.sql | Invitations superviseur | supervisor_invitations |
| 0014_alerts.sql | Alertes + acquittements | alerts, alert_acknowledgments |
| 0015_test_invitations_cascade.sql | FK membre en cascade | test_invitations |
| 0016_tests_types.sql | Types hifz / sunnah | tests |
| 0017_messages_member_admin_realtime.sql | Ouvre le cas membre↔admin (écrasé plus tard par 0083) | messages, profiles |
| 0018_messages_id_default.sql | Défaut UUID sur `messages.id` | messages |
| 0019_messages_align_legacy_schema.sql | Colonnes app + sync legacy | messages |
| 0020_alerts_realtime.sql | Realtime alertes (recrée policies) | alerts, alert_acknowledgments |
| 0021_alerts_align_columns.sql | Colonnes message/audience | alerts, alert_acknowledgments |
| 0022_alerts_title_legacy.sql | Colonnes title/body + trigger sync | alerts |
| 0023_fix_inscriptions_profiles_fk.sql | FK `inscriptions.membre_id` → profiles | inscriptions |
| 0024_member_applications_seance.sql | Séance demandée + insert anon pending + lecture séances actives | member_applications, seances |
| 0025_profiles_fields_and_member_applications_rls.sql | phone/school/level/hifz + lecture superviseur | profiles, member_applications |
| 0026_profile_multi_roles.sql | `profiles.roles[]` | profiles |
| 0027_fix_auto_affecter_min_uuid.sql | Correctif fonction d’affectation | member_applications, inscriptions |
| 0028_fix_uuid_text_activation.sql | Type `seance_id` | member_applications |
| 0029_drop_orphan_inscriptions_update_policy.sql | Drop policies orphelines | inscriptions |
| 0030_drop_profiles_update_superviseur.sql | Drop policy superviseur sur profiles | profiles |
| 0031_fix_seances_updated_at.sql | `updated_at` + `supervisor_invitations.seance_id` | seances, supervisor_invitations |
| 0032_fix_supervisor_seance_link.sql | Fonction d’affectation séance | seances, supervisor_invitations |
| 0033_seance_planning_history.sql | Historique de planning | seance_planning_history, seances |
| 0034_presence_rappels_job.sql | Job rappels (table présupposée) + cron 6 h | presence_rappels, presences (lecture) |
| 0035_push_tokens.sql | Jetons Expo | push_tokens |
| 0036_seances_saison_text_heure_optional.sql | `saison_id` texte, heures nullables | seances |
| 0037_backfill_seances_saison_id.sql | Backfill saison | seances |
| 0038_seances_timestamps.sql | created_at / updated_at | seances |
| 0039_saisons_version.sql | Colonne `version` | saisons |
| 0040_member_programs.sql | Programmes membre | member_programs |
| 0041_progression_align_tumuns.sql | `progression.saison_id` en text nullable | progression |
| 0042_saisons_dates_type_date.sql | Dates de saison en `date` | saisons |
| 0043_presences_fk_profiles.sql | FK presences → profiles | presences |
| 0044_seances_fk_saisons.sql | FK seances → saisons | seances, saisons |
| 0045_messages_drop_permissive_policies.sql | Drop `messages_select_own` / `messages_insert_own` | messages |
| 0046_messages_close_admin_member_pair.sql | Ferme le cas membre↔admin dans la fonction | messages (fonction) |
| 0047_avatars_storage.sql | Bucket `avatars` + `avatar_url` | profiles, storage.objects |
| 0048_member_applications_form_answers.sql | `form_answers jsonb` | member_applications |
| 0049_member_applications_anon_insert.sql | GRANT insert anon + policy pending | member_applications |
| 0050_fix_auto_affecter_inscriptions_conflict.sql | Correctif conflit d’inscription | inscriptions |
| 0051_inscriptions_date_inscription.sql | `date_inscription` | inscriptions |
| 0052_profiles_genre.sql | `genre` + trigger sync | profiles, member_applications |
| 0053_inscriptions_saison_id_text.sql | `saison_id` text + index unique saison | inscriptions |
| 0054_chat_groups.sql | Groupes de discussion par séance | chat_groups, chat_group_members, chat_group_messages, chat_group_reads, profiles |
| 0055_chat_group_avatars_storage.sql | Bucket avatars de groupe | storage.objects |
| 0056_profiles_date_naissance.sql | `date_naissance` | profiles |
| 0057_objectifs_alignement.sql | Table objectifs | objectifs |
| 0058_objectifs_updated_at.sql | `updated_at` | objectifs |
| 0059_objectifs_grants.sql | GRANT authenticated | objectifs |
| 0060_member_applications_kind.sql | `kind` join / season_renewal | member_applications |
| 0061_member_applications_renewal_unique.sql | Index unique renouvellement | member_applications |
| 0062_objectifs_depart.sql | `nb_hizb_depart` | objectifs |
| 0063_inscriptions_saison_sync.sql | CHECK sans espaces + trigger saison | seances, inscriptions |
| 0064_chat_group_members_sync.sql | Retrait du groupe à l’ancienne séance | inscriptions, chat_group_members |
| 0065_notifications.sql | Inbox notifications | notifications |
| 0066_alerts_saison_id.sql | `alerts.saison_id` + `send_alert` à 3 args | alerts |
| 0067_push_tokens_reassign.sql | RPC `upsert_push_token`, drop insert/update policies | push_tokens |
| 0068_notifications_dispatch.sql | Dispatch push + trigger after insert | notifications |
| 0069_notifications_push_cron.sql | Cron `* * * * *` | (cron, pas une table) |
| 0070_member_programs_type.sql | `type` hifz / mouraja3a | member_programs |
| 0071_presence_absence_notifications.sql | Notif d’absence | presences, notifications |
| 0072_presence_rappel_cron_15min.sql | Cron présence `*/15` | presence_rappels (fonction) |
| 0073_quiet_hours.sql | Heures calmes par préférences | notification_preferences (lecture), notifications |
| 0074_quiet_hours_fixed.sql | Plage fixe 22:00–07:00 (remplacée par 0088) | notifications |
| 0075_notification_copy.sql | Textes de notification | (fonctions) |
| 0076_drop_legacy_cdc_tables.sql | Drop `membres`, `superviseurs`, `users` | membres, superviseurs, users, inscriptions, presences |
| 0077_inscriptions_notifications.sql | Notifs demandes / décisions | member_applications, inscriptions |
| 0078_inscriptions_changement_seance.sql | Notif changement de séance | inscriptions |
| 0079_inscriptions_accord_genre.sql | Accord de genre dans les textes | (fonctions) |
| 0080_saisons_archive_on_deactivate.sql | Archive séances + une saison active par type | saisons, seances |
| 0081_purge_saison_ephemeral.sql | Purge éphémère à l’archivage | seances, inscriptions, progression, presences, objectifs, presence_rappels |
| 0082_harden_signup_role_and_invite_lookup.sql | `handle_new_user` force `member` | profiles, supervisor_invitations |
| 0083_messages_rg6_et_grants.sql | RG6 sans cas admin↔membre ; UPDATE limité à `read_at` | messages |
| 0084_chat_notifications.sql | Notifs chat 1-à-1 et groupe | messages, chat_group_messages |
| 0085_alertes_notifications.sql | Notif nouvelle alerte | alerts |
| 0086_seances_notifications.sql | Notifs planning / superviseur / archive | seances |
| 0087_progression_notifications.sql | Notifs progression + cron 09:00 UTC | progression, objectifs |
| 0088_quiet_hours_opt_in.sql | Heures calmes opt-in | notification_preferences, notifications |

---

## 3. Schéma final reconstruit

Rejeu **uniquement** de `supabase/migrations/`. Une table dont le `CREATE TABLE` est absent de ce dossier ne peut pas être reconstruite : les `ALTER` ultérieurs supposent un schéma déjà là (souvent décrit comme « schéma CdC » ou « base distante », ex. `0041_progression_align_tumuns.sql:6-9`, `0053_inscriptions_saison_id_text.sql:4-7`).

### 3.1 Tables dont le CREATE est dans les migrations

Légende : NN = NOT NULL. Rôles des policies : voir section 4.

#### `public.profiles` — `0001_baseline.sql:13-23` + alters

| Colonne | Type | Null | Défaut | Preuve |
|---|---|---|---|---|
| id | uuid PK | NN | — | FK `auth.users(id)` ON DELETE CASCADE (`0001:14`) |
| email | text | NN | — | `0001:15` |
| role | text | NN | — | CHECK `role in ('admin','supervisor','member')` (`0001:16`) |
| account_status | text | NN | `'active'` | CHECK `('invited','active')` (`0001:17-18`). Valeur `'inactive'` utilisée côté client (`app/constants/roles.js:131`) : **aucun ALTER du CHECK** trouvé dans `supabase/migrations/` |
| first_name | text | oui | — | `0001:19` |
| last_name | text | oui | — | `0001:20` |
| created_at | timestamptz | NN | `now()` | `0001:21` |
| updated_at | timestamptz | NN | `now()` | `0001:22` |
| roles | text[] | NN | `array['member']` | `0026:7-16` |
| phone, school, level, hifz_amount | text | oui | — | `0025:5-9` |
| avatar_url | text | oui | — | `0047:3-4` |
| genre | text | oui | — | CHECK `profiles_genre_check` (`0052:4-11`) |
| date_naissance | date | oui | — | `0056:4-5` |
| canonical_email | — | — | — | **Colonne lue/écrite par `0082:22-42` et `0052:71`, `CREATE`/`ADD COLUMN` NON TROUVÉ** dans `supabase/migrations/` |

PK : `id`. FK : `id → auth.users`. Index : `profiles_email_idx` sur `lower(email)` (`0001:25`).  
Enum : aucun (CHECK texte).

#### `public.member_applications` — `0001:85-104`

Colonnes d’origine : `id text PK`, `email NN`, `full_name`, `first_name`, `last_name`, `phone`, `school`, `level`, `hifz_amount`, `season_id text`, `status NN default 'pending'` CHECK `('pending','invited','activated','rejected')`, `user_id uuid → auth.users ON DELETE SET NULL`, `accepted_at`, `activated_at`, `rejected_at`, `created_at NN default now()`, `updated_at NN default now()`.

Ajouts : `seance_id uuid → seances ON DELETE SET NULL` (`0024:4-5`), `requested_seance_name text` (`0024:7-8`), `admin_note text` (`0024:10-11`), `form_answers jsonb NN default '{}'` (`0048:4-5`), `kind text NN default 'join'` CHECK `('join','season_renewal')` (`0060:5-23`).

Index : `member_applications_email_idx`, `member_applications_status_idx` (`0001:106-110`), `member_applications_seance_idx` (`0024:13`), `member_applications_kind_idx` (`0060:25`), `member_applications_user_season_idx` partiel `WHERE kind = 'season_renewal'` (`0060:28-30`), `member_applications_renewal_email_season_uidx` (`0061:28`).

#### `public.seances` — `0002:8-20`

| Colonne | Type | Null | Défaut |
|---|---|---|---|
| id | uuid PK | NN | `gen_random_uuid()` |
| nom | text | NN | — |
| saison_id | text (après `0036:8-9`) | oui | — |
| jour | text à la création (`0002:12`) | oui | — |
| heure_debut, heure_fin | time | oui après `0036:12-16` | — |
| superviseur_id | uuid | oui | FK `profiles(id)` ON DELETE SET NULL (`0002:15`, reposé `0010:54-55`) |
| statut | text | NN | `'active'` CHECK `('active','archivee')` |
| created_at, updated_at | timestamptz | NN | `now()` (`0002:18-19`, re-ajout `0038:4-8`) |
| planning_valide_depuis | timestamptz | NN | `now()` (`0033:19-20`) |

Index : `seances_superviseur_idx` (`0002:22`) — **non unique**.  
FK supplémentaire : `seances_saison_id_fkey` → `saisons(id)` (`0044:17-18`), après un drop de FK en `0036:4-5`.  
CHECK : `seances_saison_id_no_ws` (`0063:53-54`).  
**Aucune contrainte UNIQUE sur `superviseur_id`.** Le commentaire `0086:7` affirme « UNIQUE sur (saison_id, superviseur_id) » mais **aucun `CREATE UNIQUE INDEX` correspondant** n’existe dans `supabase/migrations/`.  
`jour` : `0033:8` et `0086:5` supposent l’enum `jour_semaine`. **`CREATE TYPE jour_semaine` NON TROUVÉ** dans `supabase/migrations/`. Le `CREATE TABLE` de 0002 déclare `jour text`.

#### `public.inscriptions` — `0003:9-16`

`id uuid PK default gen_random_uuid()`, `seance_id uuid → seances ON DELETE CASCADE`, `membre_id uuid → profiles ON DELETE CASCADE` (`0003:12`, reposé `0023:44-45` et `0076:24-26`), `statut text NN default 'accepte'` CHECK `('accepte','en_attente','retire')`, `created_at timestamptz NN default now()`.

Ajouts : `saison_id text` (`0053:26-27`), `date_inscription timestamptz NN default now()` (`0051:5-17`).  
CHECK : `inscriptions_saison_id_no_ws` (`0063:57-58`).

Index :

- `inscriptions_membre_accepte_unique` **UNIQUE partiel** `(membre_id) WHERE statut = 'accepte'` (`0003:20-22`). **Aucun `DROP INDEX` de cet index dans `supabase/migrations/`** (le drop n’est que dans `migrations_duplicates/0034_season_scoped_inscriptions.sql:17`).
- `inscriptions_seance_idx`, `inscriptions_membre_idx` (`0003:24-25`).
- `inscriptions_saison_idx` (`0053:39-40`).
- `inscriptions_membre_saison_accepte_unique` **UNIQUE partiel** `(membre_id, saison_id) WHERE statut = 'accepte' AND saison_id IS NOT NULL` (`0053:44-46`), dans un bloc qui **avale** `unique_violation` et se contente d’un `RAISE NOTICE` (`0053:47-49`).

#### `public.progression` — création `0004:9-18` (souvent ignorée si la table existait déjà)

Colonnes du `CREATE` : `id uuid PK`, `membre_id uuid → profiles ON DELETE CASCADE`, `juze integer NN CHECK 1–30`, `tumun integer CHECK 1–8`, `date_saisie date NN default current_date`, `note text`, `created_at`, `updated_at`.

`0041:15-19` fait `ALTER COLUMN saison_id DROP NOT NULL` puis `TYPE text`. Donc la colonne `saison_id` est **présupposée**, elle n’est pas ajoutée par 0004.  
Colonnes réellement écrites par l’app : `nb_hizb_completes`, `tumun_courant`, `notes`, `saison_id` (`app/lib/progressApi.js:237-241`). **`ADD COLUMN` de `nb_hizb_completes` / `tumun_courant` / `notes` : NON TROUVÉ** dans `supabase/migrations/`. `0041:6-9` dit que la table distante est déjà le schéma CdC, et que le `CREATE TABLE IF NOT EXISTS` de 0004 n’a pas remplacé ce schéma.

Index : `progression_membre_idx (membre_id, date_saisie)` (`0004:23`).

#### `public.tests` — `0005:11-16`

`id uuid PK`, `titre text NN`, `seance_id uuid → seances`, `created_by uuid → profiles`, `created_at timestamptz NN default now()`.  
Ajouts : `statut text NN default 'planifie'` CHECK `('planifie','termine','annule')` (`0012:14-16`) ; `type text NN default 'hifz'` CHECK `('hifz','sunnah')` (`0016:8-10`) ; `date_test date`, `quran_quantity text`, `form_url text` (`0016:12-19`).  
Index : `tests_statut_idx`, `tests_type_idx`, `tests_date_test_idx`.  
Pas de colonne `saison_id` dans ces migrations.

#### `public.test_invitations` — `0005:23-32`

`id uuid PK`, `test_id uuid → tests ON DELETE CASCADE`, `membre_id uuid → profiles` (cascade reposée `0015:31-32`), `statut text NN default 'en_attente'` CHECK `('en_attente','confirme','refuse')`, `date_choisie date`, `created_at`, `updated_at`.  
Index : `test_invitations_membre_idx`, `test_invitations_test_idx`.

#### `public.test_resultats` — `0005:40-47`

`id uuid PK`, `test_invitation_id uuid → test_invitations ON DELETE CASCADE`, `note numeric`, `commentaire text`, `noted_by uuid → profiles`, `created_at`.  
Index : `test_resultats_invitation_idx`.

#### `public.messages` — `0006:6-14`

`id uuid PK default gen_random_uuid()`, `seance_id uuid → seances ON DELETE CASCADE`, `sender_id uuid → profiles`, `recipient_id uuid → profiles`, `contenu text`, `image_url text`, `created_at timestamptz NN default now()`.  
Index : `messages_conversation_idx (sender_id, recipient_id, created_at)` (`0006:24-25`).

`0019` ne fait que `ADD COLUMN IF NOT EXISTS` des mêmes colonnes et un trigger de recopie vers d’éventuelles colonnes legacy (`from_user_id`, `to_user_id`, `body`, `content`, `text`, `message`) **si elles existent** (`0019:20-87`).  
`read_at` : `GRANT UPDATE (read_at)` en `0083:109` et commentaire `0084:8`. **`ADD COLUMN read_at` NON TROUVÉ.**  
Colonne audio : **NON TROUVÉE**.

#### `public.supervisor_invitations` — `0013:22-33`

`id text PK`, `email NN`, `first_name`, `last_name`, `group_name`, `status NN default 'pending'` CHECK `('pending','activated','revoked')`, `created_by uuid → profiles ON DELETE SET NULL`, `created_at`, `updated_at`.  
Ajout : `seance_id uuid → seances ON DELETE SET NULL` (`0031:7-8`).  
Index : `supervisor_invitations_email_idx`, **UNIQUE partiel** `supervisor_invitations_email_active_unique` sur `lower(email) WHERE status <> 'revoked'` (`0013:38-40`), `supervisor_invitations_seance_idx` (`0031:10`).

#### `public.alerts` — `0014:26-34` (recréée IF NOT EXISTS en 0020 et 0021)

`id text PK`, `message text NN` CHECK longueur 1–500, `audience text NN` CHECK `('all','members','supervisors')`, `created_by uuid → profiles ON DELETE SET NULL`, `created_at timestamptz NN default now()`.  
Ajouts : `title text`, `body text` (`0022:4-6`), `saison_id text` (`0066:5-6`).  
Index : `alerts_created_at_idx`, `alerts_audience_idx`, `alerts_saison_created_idx`.  
Pas d’audience `seance` dans le CHECK.

#### `public.alert_acknowledgments` — `0014:42-47`

`alert_id text → alerts ON DELETE CASCADE`, `member_id uuid → profiles ON DELETE CASCADE`, `acknowledged_at timestamptz NN default now()`, PK `(alert_id, member_id)`.

#### `public.seance_planning_history` — `0033:5-14` (schéma non qualifié `public` dans le SQL)

`id uuid PK`, `seance_id uuid NN → seances ON DELETE CASCADE`, `jour jour_semaine` (enum **non créé** dans ce dossier), `heure_debut time`, `heure_fin time`, `valide_depuis timestamptz NN`, `valide_jusqu_a timestamptz NN`, `created_at timestamptz NN default now()`.  
Index : `idx_seance_planning_history_seance_id`.

#### `public.push_tokens` — `0035:9-16`

`id uuid PK`, `user_id uuid NN → profiles ON DELETE CASCADE`, `expo_push_token text NN`, `platform text NN` CHECK `('ios','android')`, `created_at`, `updated_at`.  
Ajout : `last_seen_at timestamptz NN default now()` (`0067:8-9`).  
UNIQUE : `push_tokens_expo_push_token_key (expo_push_token)` (`0035:32`, reposé `0067:21`).  
Index : `push_tokens_user_id_idx`.

#### `public.member_programs` — `0040:6-17`

`id text PK`, `membre_id uuid NN → profiles ON DELETE CASCADE`, `title text NN`, `nb_hizb integer NN CHECK > 0`, `duration_days integer NN CHECK > 0`, `start_date text`, `completed_tumuns integer NN default 0 CHECK >= 0`, `created_at`, `updated_at`, CHECK `completed_tumuns <= nb_hizb * 8`.  
`progress_percentage numeric` **GENERATED ALWAYS** (`0040:30-34`).  
Ajout : `type text NN default 'hifz'` CHECK `('hifz','mouraja3a')` (`0070:14-22`).  
Index : `member_programs_membre_idx`.

#### `public.objectifs` — `0057:5-12`

PK `(membre_id, saison_id)`. `membre_id uuid NN → auth.users ON DELETE CASCADE`, `saison_id text NN`, `nb_hizb_cible integer NN` CHECK 1–60, `created_at timestamptz NN default now()`.  
Ajouts : `updated_at timestamptz NN default now()` (`0058:2-3`), `nb_hizb_depart smallint NN default 0` CHECK 0–60 (`0062:5-7`).  
Index : `objectifs_saison_idx`.

#### `public.chat_groups` — `0054:15-22`

`id uuid PK`, `seance_id uuid NN UNIQUE → seances ON DELETE CASCADE`, `nom text NN`, `avatar_url text`, `created_at`, `updated_at`.

#### `public.chat_group_members` — `0054:24-31`

PK `(group_id, membre_id)`. FK vers `chat_groups` et `profiles` ON DELETE CASCADE. `role text NN default 'member'` CHECK `('admin','member')`, `added_at`.  
Index : `chat_group_members_membre_idx`.

#### `public.chat_group_messages` — `0054:36-43`

`id uuid PK`, `group_id → chat_groups`, `sender_id → profiles`, `contenu text`, `image_url text`, `created_at`. Pas de colonne audio.  
Index : `chat_group_messages_group_created_idx`.

#### `public.chat_group_reads` — `0054:48-53`

PK `(group_id, user_id)`, `last_read_at timestamptz NN default now()`.

#### `public.notifications` — `0065:9-35`

`id uuid PK`, `user_id uuid NN → profiles ON DELETE CASCADE`, `category text NN` CHECK `('chat','presence','inscriptions','seances','progression','alertes','systeme')`, `event_type text NN`, `title text NN`, `body text NN`, `payload jsonb NN default '{}'`, `source_table text`, `source_id text`, `read_at`, `push_sent_at`, `claimed_at`, `dispatch_request_id bigint`, `push_error text`, `push_attempts integer NN default 0`, `created_at timestamptz NN default now()`.

Index : `notifications_user_created_idx` ; `notifications_user_unread_idx` partiel `WHERE read_at IS NULL` ; `notifications_dedup_idx` **UNIQUE partiel** `(user_id, event_type, source_id) WHERE source_id IS NOT NULL AND btrim(source_id) <> ''` ; `notifications_push_claim_idx` partiel `WHERE push_sent_at IS NULL` (`0065:37-54`).

### 3.2 Tables altérées sans `CREATE` dans `supabase/migrations/`

| Table | Ce que les migrations font | CREATE |
|---|---|---|
| `public.saisons` | `version` + CHECK positif (`0039:4-7`) ; `start_date`/`end_date` en `date` + CHECK `saisons_dates_coherentes` (`0042`) ; CHECK `saisons_registration_requires_active` (`0080:121-123`) ; index unique partiel `saisons_one_active_per_type` sur `(type) WHERE active` (`0080:126-128`) | **NON TROUVÉ** (présent seulement dans `migrations_duplicates/0035_saisons.sql`) |
| `public.presences` | FK `membre_id → profiles` (`0043:12-17`, reposé `0076:40-42`) ; trigger d’absence (`0071:76-78`) | **NON TROUVÉ**. Unique `(membre_id, seance_id, date)` **NON TROUVÉ** (le client le suppose : `presenceApi.js:684-715`) |
| `public.presence_rappels` | RLS, policies, UNIQUE `(seance_id, date)` si la table existe (`0034:18-46`) | **NON TROUVÉ** (`CREATE TABLE` absent de tout le dépôt SQL hors éventuel schéma préexistant) |
| `public.notification_preferences` | `ADD COLUMN quiet_hours_enabled boolean NN default false` (`0088:17-18`) | **NON TROUVÉ** dans `supabase/migrations/` (CREATE dans `migrations_duplicates/0066_notification_preferences.sql`) |
| `public.season_stats` | aucun ALTER dans la série officielle | **NON TROUVÉ** (CREATE dans `migrations_duplicates/0043_season_stats.sql`). L’app l’appelle quand même (`seasonStatsApi.js:559`) |
| `public.membres`, `public.superviseurs`, `public.users` | `DROP TABLE IF EXISTS … CASCADE` (`0076:11-13`) | CREATE **NON TROUVÉ**. L’app lit encore `membres` (`membersApi.js:349`, `372`) |

### 3.3 Tables créées et usage `app/` (`.from('…')`)

Toutes les tables **créées** dans `supabase/migrations/` ont au moins un `.from(...)` dans `app/` : profiles, member_applications, seances, inscriptions, progression, tests, test_invitations, test_resultats, messages, supervisor_invitations, alerts, alert_acknowledgments, seance_planning_history, push_tokens, member_programs, objectifs, chat_groups, chat_group_members, chat_group_messages, chat_group_reads, notifications.

Aucune table créée par la série officielle n’est orpheline côté client.

À l’inverse, le client appelle des relations **sans CREATE officiel** : `saisons`, `presences`, `presence_rappels`, `notification_preferences`, `season_stats`, `membres` (cette dernière est explicitement droppée en 0076).

---

## 4. Sécurité

Rôle « public » = clause `TO` absente (la policy s’applique à tous les rôles, le GRANT décide ensuite).

### 4.1 Policies RLS finales (dernier `CREATE` non suivi d’un `DROP`)

#### profiles

| Nom | Commande | Rôles | USING | WITH CHECK | Migration |
|---|---|---|---|---|---|
| profiles_select_own | SELECT | public | `auth.uid() = id` | — | `0001:33-35` |
| profiles_update_own | UPDATE | public | `auth.uid() = id` | **absent** | `0001:38-40` |
| profiles_insert_own | INSERT | public | — | `auth.uid() = id` | `0001:43-45` |
| profiles_select_admin | SELECT | public | `private.is_admin()` | — | `0009:328-331` |
| profiles_select_superviseur_seance | SELECT | public | `private.supervises_member(profiles.id)` | — | `0009:335-338` |
| profiles_select_superviseur_admin | SELECT | public | `private.is_supervisor() and role = 'admin'` | — | `0009:342-345` |
| profiles_select_membre_seance | SELECT | public | `private.is_my_supervisor(profiles.id)` | — | `0009:349-352` |
| profiles_select_membre_admin | SELECT | public | `private.is_member() and role = 'admin'` | — | `0017:34-37` |
| profiles_select_chat_group_peer | SELECT | authenticated | voir `0054:421` | — | `0054:420-421` |
| profiles_update_superviseur | — | — | **DROP** `0030:8` | — | jamais créée dans la série officielle (`DROP IF EXISTS`) |

#### seances

| Nom | Commande | USING | WITH CHECK | Migration |
|---|---|---|---|---|
| seances_admin_all | ALL | `private.is_admin()` | idem | `0009:360-364` |
| seances_select_own | SELECT | `superviseur_id = auth.uid()` | — | `0002:49-51` (non droppée par 0009) |
| seances_insert_own | INSERT | — | `superviseur_id = auth.uid()` | `0002:55-57` |
| seances_update_own | UPDATE | `superviseur_id = auth.uid()` | idem | `0002:61-64` |
| seances_delete_own | DELETE | `superviseur_id = auth.uid()` | — | `0002:68-70` |
| seances_select_member_inscrit | SELECT | `private.member_inscrit_seance(seances.id)` | — | `0009:370-372` |
| seances_select_active_public | SELECT | `statut = 'active'` | — | `0024:20-22` (tous rôles, y compris anon via GRANT `0024:17`) |

#### inscriptions

| Nom | Commande | USING | WITH CHECK | Migration |
|---|---|---|---|---|
| inscriptions_admin_all | ALL | `private.is_admin()` | idem | `0009:380-384` |
| inscriptions_select_own_member | SELECT | `membre_id = auth.uid()` | — | `0011:20-22` |
| inscriptions_select_superviseur | SELECT | `private.supervises_seance(inscriptions.seance_id)` | — | `0009:388-390` |
| inscriptions_write_superviseur | ALL | `private.supervises_seance(...)` | idem | `0009:394-398` |

Policies droppées et non recréées : `superviseur_modifie_ses_inscriptions`, `superviseur_lit_ses_inscriptions` (`0029:18-20`).  
`inscriptions_delete_superviseur` : **NON TROUVÉE** dans `supabase/migrations/` (seulement `migrations_duplicates/0027`). La suppression passe par `inscriptions_write_superviseur` FOR ALL.

#### progression

| Nom | Commande | USING | WITH CHECK | Migration |
|---|---|---|---|---|
| progression_select_own | SELECT | `membre_id = auth.uid()` | — | `0004:43-45` |
| progression_insert_own | INSERT | — | `membre_id = auth.uid()` | `0004:48-50` |
| progression_update_own | UPDATE | `membre_id = auth.uid()` | idem | `0004:53-56` |
| progression_delete_own | DELETE | `membre_id = auth.uid()` | — | `0004:59-61` |
| progression_admin_select | SELECT | `private.is_admin()` | — | `0009:406-408` |
| progression_select_superviseur | SELECT | `private.supervises_member(progression.membre_id)` | — | `0009:412-414` |

Pas de policy d’écriture superviseur ni admin.

#### tests / test_invitations / test_resultats

État final = recréation `0009:421-504`, plus les policies membre de `0005` non redroppées par 0009 :

- `tests_admin_all` ALL, `tests_select_superviseur` SELECT, `tests_write_superviseur` ALL, `tests_select_member_invited` SELECT (`0009:422-446`).
- `test_invitations_admin_all` ALL, `test_invitations_select_superviseur` SELECT, `test_invitations_write_superviseur` ALL (`0009:454-472`).
- `test_invitations_select_own_member` SELECT et `test_invitations_update_own_member` UPDATE : créées `0005:158-166`, **non présentes dans le bloc 0009**. 0009 ne les droppe pas. Elles restent si 0005 a bien été appliqué.
- `test_resultats_*` : `0009:480-504`.

#### messages

| Nom | Commande | USING / WITH CHECK | Migration |
|---|---|---|---|
| messages_select_authorized | SELECT | expéditeur ou destinataire **et** `private.messages_pair_authorized` | `0006:168-174` |
| messages_insert_authorized | INSERT | `sender_id = auth.uid()` et paire autorisée | `0006:179-185` |
| messages_select_own, messages_insert_own | — | **DROP** | `0045:19-20` |
| messages_update_read | — | citée `0045:16` et `0083:16` | **CREATE NON TROUVÉ** dans `supabase/migrations/` |

La fonction appelée par ces policies est **remplacée** en `0083:31-102` (cas membre↔admin retiré).

#### member_applications

| Nom | Commande | Rôles | Prédicat | Migration |
|---|---|---|---|---|
| member_applications_admin_all | ALL | public | `private.is_admin()` USING + WITH CHECK | `0009:515-519` |
| member_applications_self_update | UPDATE | public | e-mail JWT USING + WITH CHECK | `0001:137-141` |
| member_applications_self_select | SELECT | public | e-mail JWT | `0001:144-147` |
| member_applications_select_superviseur | SELECT | public | inscription acceptée + séance du superviseur | `0025:13-24` |
| member_applications_anon_insert_pending | INSERT | anon, authenticated | `status = 'pending'` | `0049:12-15` (remplace `0024:28-30`) |

#### supervisor_invitations

`supervisor_invitations_admin_all` ALL, `private.is_admin()` — créée `0013:50-51`. Corps : le fichier limite l’accès admin (commentaire `0013:48-49`). Pas de policy anon de lecture de la table ; la lecture publique passe par la RPC `get_pending_supervisor_invitation` (`0082:52-75`).

#### alerts / alert_acknowledgments

Recréées en `0021:117-140` (dernier CREATE après 0014 et 0020) :

- `alerts_admin_all` ALL `private.is_admin()` + WITH CHECK
- `alerts_select_recipients` SELECT `private.alert_targets_me(audience)`
- `alert_acknowledgments_admin_all` ALL
- `alert_acknowledgments_select_own` SELECT
- `alert_acknowledgments_insert_own` INSERT

Le corps détaillé du SELECT/INSERT d’acquittement est celui de `0021` (même noms qu’en `0014:133-147`).

#### seance_planning_history

- `seance_planning_history_select_superviseur` SELECT `to authenticated`, séance dont `superviseur_id = auth.uid()` (`0033:25-35`)
- `seance_planning_history_admin_all` ALL `to authenticated`, `profiles.role = 'admin'` (`0033:37-46`) — **WITH CHECK absent**

#### presence_rappels (table non créée ici)

- `presence_rappels_select_superviseur` SELECT (`0034:61-70`)
- `presence_rappels_admin_all` ALL USING + WITH CHECK admin (`0034:73-86`)

#### push_tokens

Après `0067:27-28` (drop insert et update) il reste :

- `push_tokens_select_own` SELECT `user_id = auth.uid()` (`0035:48-50`)
- `push_tokens_delete_own` DELETE `user_id = auth.uid()` (`0035:64-66`)

Insert/update : RPC `upsert_push_token` SECURITY DEFINER (`0067:41`, grant `0067:86`).

#### member_programs

- `member_programs_crud_own` ALL USING + WITH CHECK `membre_id = auth.uid()` (`0040:46-50`)
- `member_programs_select_superviseur` SELECT `private.supervises_member` (`0040:54-56`)
- `member_programs_select_admin` SELECT `private.is_admin()` (`0040:60-62`)

Pas d’écriture superviseur/admin.

#### objectifs (`0057:21-67`, rôles `to authenticated`)

- `objectifs_select_own` / `insert_own` / `update_own` (USING + WITH CHECK) / `delete_own` : `membre_id = auth.uid()`
- `objectifs_admin_all` ALL `private.is_admin()` USING + WITH CHECK
- `objectifs_select_superviseur` SELECT : inscription `accepte` et `seances.superviseur_id = auth.uid()`

#### chat (`0054:326-413`, `to authenticated`)

- `chat_groups_select_member` SELECT : membre du groupe ou admin
- `chat_groups_update_admin` UPDATE USING + WITH CHECK `private.is_chat_group_admin(id)`
- `chat_group_members_select`, `chat_group_members_insert_admin`, `chat_group_members_delete_admin`
- `chat_group_messages_select`, `chat_group_messages_insert`
- `chat_group_reads_select_own`, `insert_own`, `update_own`

#### notifications (`0065:63-75`, `to authenticated`)

- `notifications_select_own` SELECT `user_id = auth.uid()`
- `notifications_update_read_own` UPDATE USING + WITH CHECK `user_id = auth.uid()`

Pas de policy INSERT (insert réservé service_role / SECURITY DEFINER, commentaire `0065:3`).

#### saisons, presences, notification_preferences, season_stats

**Aucune policy dans `supabase/migrations/`.** Leurs policies ne sont que dans `migrations_duplicates/`.

### 4.2 Signaux demandés

- **`FOR ALL` sans filtre** (`USING (true)` ou sans prédicat) : **NON TROUVÉ**. Les `FOR ALL` admin ont `private.is_admin()` ou un `EXISTS` sur `profiles.role = 'admin'`.
- **`USING (true)`** : **NON TROUVÉ** dans `supabase/migrations/`.
- **SELECT très ouvert** : `seances_select_active_public` = `statut = 'active'` pour tout rôle (`0024:20-22`) + `GRANT SELECT` à `anon` (`0024:17`).
- **UPDATE sans `WITH CHECK` explicite** :
  - `profiles_update_own` (`0001:38-40`)
  - `seance_planning_history_admin_all` (`0033:37-46`) — PostgreSQL réutilise alors `USING` comme `WITH CHECK` pour UPDATE, mais la clause n’est pas écrite
  - `push_tokens_update_own` a été **droppée** (`0067:28`), donc plus dans l’état final
- **RLS activée dans la série officielle sans aucune policy** : **NON TROUVÉ** pour les tables créées ici. `presence_rappels` a des policies (`0034`). `presences` : `ENABLE ROW LEVEL SECURITY` **NON TROUVÉ** dans `supabase/migrations/` (seulement dans `migrations_duplicates/`).
- **GRANT `authenticated` absent de la série officielle** (la table est pourtant utilisée par l’app) :
  - `saisons` : GRANT **NON TROUVÉ** (seulement `migrations_duplicates/0035_saisons.sql:93`)
  - `presences` : GRANT **NON TROUVÉ** (seulement `migrations_duplicates/0032` et `0068`)
  - `notification_preferences` : GRANT **NON TROUVÉ** (seulement `migrations_duplicates/0066`)
  - `season_stats` : GRANT **NON TROUVÉ**
  - `profiles` : GRANT présent, y compris `anon` (`0001:30`)
  - `messages` : SELECT + INSERT (`0006:30`) puis `UPDATE (read_at)` seulement (`0083:108-109`)
  - `seance_planning_history` : `GRANT SELECT` seulement (`0033:48`)
  - `push_tokens` après 0067 : `SELECT, DELETE` (`0067:32`), plus INSERT/UPDATE table
  - `notifications` : `SELECT, UPDATE (read_at)` (`0065:59`)

### 4.3 Fonctions `SECURITY DEFINER` et schéma `private`

Le schéma `private` est créé en `0006:37` (et `CREATE SCHEMA IF NOT EXISTS` en `0065:7`, `0077:15`). Il n’est pas dans `config.toml` `schemas` (`config.toml:13` : `public`, `graphql_public` seulement).

Fonctions dont la **dernière** définition dans la série est `SECURITY DEFINER` (rôle = ce qu’elles font) :

| Fonction | Rôle | Dernière migration |
|---|---|---|
| `public.handle_new_user` | À l’insert Auth, crée un profil **toujours** `role/roles = member` | `0082:13-47` |
| `public.get_pending_supervisor_invitation` | Renvoie id/email/status d’une invitation `pending` (anon + authenticated) | `0082:52-75` |
| `public.link_member_application_on_profile` | Passe la demande en `activated` | `0001:150` (trigger recréé `0026:280`) |
| `public.send_alert(text,text,text)` et surcharge 2 args | Insert alerte, réservé `private.is_admin()` | `0066:11-66` |
| `public.claim_pending_push_notifications` | Claim SKIP LOCKED de la file push | `0088:74` |
| `public.upsert_push_token` | Upsert jeton de `auth.uid()` | `0067:41` |
| `public.check_presence_reminders` | Rappels de présence | `0072` remplace le corps ; grant `0034:273` |
| `public.check_progression_relances` | Relances de saisie | `0087:231` |
| `public.enqueue_test_notification` | **DROP** en `0088:184` | plus dans l’état final |
| `private.messages_pair_authorized` | Paires RG6 | `0083:31` |
| `private.is_admin`, `is_supervisor`, `supervises_member`, `is_my_supervisor`, `supervises_seance`, `member_inscrit_seance`, `supervises_test`, `member_invited_test`, `invitation_of_member`, `supervises_invitation` | Prédicats RLS | `0009` |
| `private.profile_has_role`, `user_has_role`, `profile_roles_array` | Lecture `roles[]` | `0026` |
| `private.is_chat_group_admin/member`, `shares_chat_group` | RLS chat | `0054:65-132` |
| `private.in_quiet_hours`, `user_in_quiet_hours` | Plage calme opt-in | `0088:23-67` |
| `private.dispatch_pending_push`, `notifications_after_insert`, `invoke_send_push`, `vault_secret` | Envoi push | `0088` / `0068` |
| `private.notify_*` (inscriptions, chat, alertes, séances, progression, présence) | Insert dans `notifications` | `0071`–`0087` |
| `private.purge_ephemeral_for_seances`, `saisons_archive_seances_on_deactivate`, `saisons_force_registration_closed` | Archivage de saison | `0080`–`0081` |
| `private.inscriptions_unsync_old_chat_group` | Retire le membre de l’ancien groupe | `0064:11` |
| `private.notifications_guard_client_update` | Bloque toute colonne autre que `read_at` | `0065:79` |
| `public.auto_affecter_seance_on_activation` | Affecte une séance à l’activation | dernière version `0050` |
| `public.assign_supervisor_seance_from_invitation` | Lie le superviseur à la séance | `0032` |
| `public.profile_canonical_email` | appelée par `0082:22` | **CREATE NON TROUVÉ** dans `supabase/migrations/` |
| `private.profiles_guard_role` | citée en commentaire `0082:5` comme « (0071) » | **CREATE NON TROUVÉ**. Le `0071` officiel est `0071_presence_absence_notifications.sql`. Le trigger homonyme est dans `migrations_duplicates/0071_profiles_role_guard.sql` |

### 4.4 Déclencheurs (état final : dernier `CREATE`, non droppé ensuite)

| Nom | Table | Moment | Effet | Migration |
|---|---|---|---|---|
| on_auth_user_created | auth.users | AFTER INSERT | `handle_new_user` (corps final 0082) | `0001:76-78` |
| on_profile_link_member_application | profiles | AFTER INSERT OR UPDATE OF email, role | lie la demande | recréé `0026:280` |
| on_profile_link_supervisor_invitation | profiles | AFTER INSERT/UPDATE | active l’invitation | recréé `0026:275` |
| member_applications_auto_affectation | member_applications | voir `0007:61` | affectation séance | `0007:61` |
| test_invitations_member_update_guard | test_invitations | voir `0005:195` | limite les colonnes modifiables par le membre | `0005:195` |
| messages_sync_legacy_columns | messages | BEFORE INSERT OR UPDATE | recopie colonnes legacy | `0019:95-98` |
| alerts_sync_legacy_columns | alerts | voir `0022:62` | recopie title/body | `0022:62` |
| member_applications_sync_profile | member_applications | voir `0052:38` | recopie genre (et champs) vers profiles | `0052:38` (remplace `0025:49`) |
| trg_inscriptions_date_default | inscriptions | voir `0051:32` | défaut `date_inscription` | `0051:32` |
| trg_sync_inscription_saison_id | inscriptions | BEFORE INSERT OR UPDATE OF seance_id | copie `seances.saison_id` | `0053:68-71` |
| trg_inscriptions_sync_saison | inscriptions | voir `0063:48` | même famille de sync | `0063:48` |
| seances_ensure_chat_group | seances | AFTER INSERT OR UPDATE OF superviseur_id, statut | crée le groupe | `0054:214-215` |
| inscriptions_sync_chat_group | inscriptions | voir `0054:274` | ajoute le membre au groupe | `0054:274` |
| chat_groups_guard_immutable | chat_groups | voir `0054:301` | fige `seance_id` | `0054:301` |
| trg_inscriptions_unsync_old_chat_group | inscriptions | AFTER UPDATE OF seance_id OR DELETE | retire l’ancien groupe (sauf role admin) | `0064:35-37` |
| notifications_guard_client_update | notifications | voir `0065:113` | seul `read_at` est modifiable par le client | `0065:113` |
| trg_notifications_after_insert | notifications | AFTER INSERT | dispatch push, sauf heures calmes | dernier corps `0088:160` ; trigger posé `0068:222` |
| trg_presences_notify_absence | presences | AFTER INSERT OR UPDATE | notif d’absence | `0071:77-78` |
| notify_member_applications_demande | member_applications | voir `0077:100` | notif demande | `0077:100` |
| notify_member_applications_decision | member_applications | voir `0077:221` | notif décision | `0077:221` |
| notify_member_applications_sans_affectation | member_applications | voir `0077:434` | notif sans séance | `0077:434` |
| notify_inscriptions_nouveau_membre | inscriptions | voir `0077:325` | notif nouveau membre | `0077:325` |
| notify_inscriptions_changement_seance | inscriptions | voir `0078:166` | notif changement de séance | `0078:166` |
| trg_saisons_force_registration_closed | saisons | BEFORE UPDATE OF active | ferme les inscriptions si inactive | `0080:81-82` |
| trg_saisons_archive_seances_on_deactivate | saisons | AFTER UPDATE OF active WHEN désactivation | archive les séances (+ purge 0081) | `0080:108-111` |
| notify_messages_chat | messages | voir `0084:133` | notif 1-à-1 | `0084:133` |
| notify_chat_group_messages | chat_group_messages | voir `0084:224` | notif groupe | `0084:224` |
| notify_alerts_nouvelle | alerts | voir `0085:94` | notif alerte | `0085:94` |
| notify_seances_planning | seances | voir `0086:129` | notif planning | `0086:129` |
| notify_seances_superviseur | seances | AFTER UPDATE OF superviseur_id | notif affectation | `0086:240-243` |
| notify_seances_archivee | seances | voir `0086:323` | notif archive | `0086:323` |
| notify_progression_saisie | progression | voir `0087:121` | notif saisie | `0087:121` |
| notify_objectifs_insert / notify_objectifs_update | objectifs | INSERT ; UPDATE OF nb_hizb_cible | notif objectif | `0087:209-217` |

`private.profiles_guard_role` / trigger homonyme : **NON TROUVÉ** dans cette liste.

### 4.5 Stockage — bucket `avatars`

`0047_avatars_storage.sql:6-17` : bucket `avatars`, `public = true`, limite 2 097 152 octets, MIME `image/jpeg`, `image/png`. Colonne `profiles.avatar_url`.

| Policy | Commande | Rôles | Prédicat |
|---|---|---|---|
| avatars_select_public | SELECT | public | `bucket_id = 'avatars'` (`0047:21-23`) |
| avatars_insert_own | INSERT | authenticated | bucket avatars et premier segment du nom = `auth.uid()` (`0047:27-33`) |
| avatars_update_own | UPDATE | authenticated | idem USING + WITH CHECK (`0047:36-46`) |
| avatars_delete_own | DELETE | authenticated | idem (`0047:49-55`) |

Bucket voisin (pas `avatars`) : policies `chat_group_avatars_*` en `0055_chat_group_avatars_storage.sql:17-49`.

---

## 5. Règles de gestion

### RG1 — un superviseur, une seule séance

**ABSENTE en base** comme contrainte UNIQUE sur `seances.superviseur_id`.  
Preuve : index non unique `seances_superviseur_idx` (`0002:22`). Aucun `CREATE UNIQUE INDEX` sur `superviseur_id` dans `supabase/migrations/`. Le commentaire `0086:7` n’est pas une contrainte.

**Le client gère plusieurs séances.** `AdminSupervisorsScreen.js:56-60` : si `linked.length > 1`, libellé « N حصص ». `AdminSupervisorDetailScreen.js:149-150` filtre toutes les séances non archivées du superviseur.

### RG2 — plusieurs superviseurs par séance

**ABSENTE.** Une séance a une seule colonne `superviseur_id uuid` (`0002:15`), pas de table de liaison. Plusieurs superviseurs sur la même séance : impossible dans ce schéma. Plusieurs séances pour un même superviseur : possible (RG1).

### RG3 — un membre, une seule séance acceptée par saison

**PARTIEL en base.**

- Index voulu : `inscriptions_membre_saison_accepte_unique` sur `(membre_id, saison_id) WHERE statut = 'accepte' AND saison_id IS NOT NULL` (`0053:44-46`). Création best-effort : en cas de doublons, la migration logue et continue (`0053:47-49`).
- Index plus strict toujours présent dans la série : `inscriptions_membre_accepte_unique` sur `(membre_id) WHERE statut = 'accepte'` (`0003:20-22`), **jamais droppé** dans `supabase/migrations/`. S’il est réellement en place, un membre ne peut avoir **qu’une** inscription `accepte` tous musims confondus, ce qui contredit le commentaire de `updateMemberSeance` (« les inscriptions des anciens musims ne sont jamais touchées », `membersApi.js:598-599`).

### RG4 — insertion anonyme limitée à `pending`

**Garantie en BASE.** Policy `member_applications_anon_insert_pending` `FOR INSERT TO anon, authenticated WITH CHECK (status = 'pending')` (`0049:12-15`) et `GRANT INSERT` à `anon` (`0049:7`). Un admin authentifié peut écrire d’autres statuts via `member_applications_admin_all` (`0009:515-519`).

### RG5 — unicité (membre, séance, date) et fenêtre 48 h

- Unicité : **NON TROUVÉE** comme contrainte dans `supabase/migrations/`. Le client upsert avec `onConflict: "membre_id,seance_id,date"` (`presenceApi.js:714-715`).
- Fenêtre 48 h de **marquage** : **côté CLIENT** (`supervisorHelpers.js:190-193`, `+ 48 * 60 * 60 * 1000`). Aucune policy ni trigger qui refuse un `INSERT` hors fenêtre : **NON TROUVÉ**.
- Fenêtre 48 h du **rappel** : en base, `v_window_end := v_session_start + interval '48 hours'` (`0034:191`). Ce n’est pas un verrou d’écriture.

### RG6 — paires de messagerie

**Garantie en BASE** par `private.messages_pair_authorized` (`0083:31-102`), appelée par `messages_select_authorized` et `messages_insert_authorized` (`0006:168-185`).

Paires autorisées :

1. membre → superviseur de **sa** séance, inscription `accepte`, `seances.id = p_seance` (`0083:56-66`)
2. superviseur → membre inscrit dans **sa** séance, même condition (`0083:69-79`)
3. superviseur ↔ admin : si `p_seance` est null, `return true` ; sinon la séance doit appartenir à l’un des deux (`0083:82-93`)
4. membre ↔ admin : **retiré** (`0083:96-98`). Canal fermé en base après 0083.

Le `GRANT UPDATE` authenticated est réduit à la colonne `read_at` (`0083:108-109`). La policy `messages_update_read` elle-même n’est pas créée dans ce dossier.

Groupes (`chat_groups`) : canal séparé, un groupe par séance (`0054:3-5`, `seance_id UNIQUE`).

### RG7 — qui lit et écrit `progression`

**BASE (RLS) :**

- Membre : SELECT/INSERT/UPDATE/DELETE de ses lignes (`0004:43-61`)
- Superviseur : SELECT seulement (`0009:412-414`)
- Admin : SELECT seulement (`0009:406-408`)

Pas d’écriture superviseur ni admin. GRANT `select, insert, update, delete` à `authenticated` (`0004:28`), filtré par les policies.

### RG8 — étapes du workflow de test et écrans

| Étape | Où |
|---|---|
| Création | Écran admin `AdminTestsScreen.js` appelle `createTest` (`AdminTestsScreen.js:164`, `testsApi.js:248`). Aucun écran superviseur n’appelle `createTest` (seul appelant : AdminTestsScreen). La RLS `tests_write_superviseur` autorise pourtant l’écriture superviseur (`0009:436-440`). |
| Invitation | `testsApi.js` insert `test_invitations` (`testsApi.js:330`). Pas d’écran dédié « invitation » séparé : le flux est dans l’écran admin des tests. |
| Confirmation | Statuts `en_attente` / `confirme` / `refuse` en base (`0005:27-28`). Policy membre `test_invitations_update_own_member` (`0005:165-166`) + trigger `test_invitations_member_update_guard` (`0005:195`). |
| Choix de date | Colonne `date_choisie` (`0005:29`). |
| Notation | Table `test_resultats` (`0005:40-47`), écriture superviseur `test_resultats_write_superviseur` (`0009:499-504`). |
| Notification | Catégorie `systeme` / fonction `enqueue_test_notification` **supprimée** en `0088:184`. Une notification spécifique « test noté » distincte : **NON TROUVÉE** comme trigger sur `test_resultats`. |

Types en base : `hifz` (date + `quran_quantity`) et `sunnah` (date + `form_url`) (`0016:5-19`, contrôle client `testsApi.js:242-278`). Rattachement : colonne `seance_id` optionnelle (`0005:14`, `testsApi.js:253`). **Pas de `saison_id` sur `tests`.**

### RG9 — blocage de navigation et audiences

**CLIENT + BASE.**

- Blocage : composant `BlockingAlertGate` (`app/components/BlockingAlertGate.js:24-34`), modale plein écran, poll 30 s (`BlockingAlertGate.js:22`). Commentaire d’intention dans `0014:5-10`.
- Audiences **en base** : CHECK et RPC `('all','members','supervisors')` (`0014:31`, `0066:33-34`). `saison_id` optionnel (`0066:5-6`, `0066:39-48`).
- Ciblage par séance : **NON TROUVÉ** (pas de `seance_id` sur `alerts`, pas de valeur d’audience séance).
- Le filtre « après inscription / saison » est décrit comme côté API (`0066:2-3`) et implémenté dans `alertsApi.js` (sélection `saison_id`, vers `alertsApi.js:422`).

### RG10 — mode examen

**ABSENT.** Recherche `examen` / `examMode` / `mode examen` dans `app/` : aucun fichier.

### RG11 — invitation et activation

**BASE + Edge Function, pas un jeton à expiration longue.**

- Membre : statut `invited` sur `member_applications` (`0001:97`), activation par `activate-invited-account` si une ligne `status = invited` et `kind` join existe (`activate-invited-account/index.ts:115-116`). Trigger `link_member_application_on_profile` peut aussi passer la demande en `activated` (`0001:157-165`).
- Superviseur : `supervisor_invitations.status = pending` (`0013:28-29`), RPC `get_pending_supervisor_invitation` (`0082:52-70`), activation Edge si invitation pending.
- Expiration d’un jeton d’invitation : **NON TROUVÉE** (pas de colonne `expires_at` sur ces tables dans les migrations). Rate-limit mémoire seulement (`activate-invited-account/index.ts:21-22`).
- `0082:13-45` empêche qu’un `signUp` avec `raw_user_meta_data.role = admin` crée un admin : le trigger force `member`.

---

## 6. Affirmations à vérifier

| # | Affirmation | Verdict | Preuve |
|---|---|---|---|
| 1 | Le superviseur ne peut plus modifier les fiches membres (`profiles_update_superviseur` supprimée) | **VRAI** pour cette policy | `DROP POLICY IF EXISTS profiles_update_superviseur` (`0030:8`). Elle n’est pas recréée. Aucune autre policy `UPDATE` superviseur sur `profiles` dans la série. Le membre peut toujours s’updater lui-même (`profiles_update_own`, `0001:38-40`). |
| 2 | Le superviseur peut changer un membre de séance (`updateMemberSeance`) ; un trigger recopie la saison | **PARTIEL** | `updateMemberSeance` existe (`membersApi.js:603`) et est appelée depuis la fiche **superviseur** `MemberProfileScreen.js:310`. Le trigger `trg_sync_inscription_saison_id` copie `seances.saison_id` (`0053:53-71`). Qui a le droit d’UPDATE : `inscriptions_write_superviseur` (ses séances, `0009:394-398`) et `inscriptions_admin_all`. Le déplacement vers une séance qui n’est pas la sienne échoue au `WITH CHECK`. |
| 3 | Le retrait supprime la ligne `inscriptions` et retire du groupe | **VRAI** si le DELETE aboutit | `removeMemberFromSeance` fait `.delete()` (`membersApi.js:722-738`). Trigger `trg_inscriptions_unsync_old_chat_group` sur DELETE retire `chat_group_members` sauf `role = 'admin'` (`0064:18-37`). Le commentaire cite « migration 0027 » (`membersApi.js:720`) : ce fichier officiel est `0027_fix_auto_affecter_min_uuid.sql`, pas une policy delete. La policy delete dédiée est **NON TROUVÉE** ; le FOR ALL `inscriptions_write_superviseur` couvre le DELETE. |
| 4 | `progression` utilise `nb_hizb_completes` et `tumun_courant` (0–7) ; `objectifs` utilise `nb_hizb_depart` et `nb_hizb_cible` | **PARTIEL** | Client : `tumun_courant` 0–7 (`progressApi.js:191`, `227-228`) ; `objectifs` colonnes `nb_hizb_cible`, `nb_hizb_depart` (`objectifsApi.js:7`, `0062:5-7`, `0057:8`). Base : `nb_hizb_cible` CHECK 1–60 et `nb_hizb_depart` CHECK 0–60 **sont créés**. `nb_hizb_completes` / `tumun_courant` : **ADD COLUMN NON TROUVÉ**. Le CREATE 0004 a `tumun` CHECK **1–8** (`0004:13`), pas 0–7, et `0041` ne change pas ce CHECK. Commentaire `0087:6` dit `tumun_courant` 0–8, le client dit 0–7. |
| 5 | `profiles.roles[]` existe ; priorité admin > superviseur > membre | **VRAI** | Colonne `0026:7-16`. Priorité client `resolveSessionRole` (`app/constants/roles.js:39-46`). |
| 6 | `profiles_guard_role` empêche l’auto-promotion | **FAUX** dans la série officielle | Fonction et trigger **NON TROUVÉS** dans `supabase/migrations/`. Commentaire seulement (`0082:5`). Le garde réel à l’inscription est `handle_new_user` qui écrit `member` (`0082:34-35`). Un `UPDATE` de sa propre ligne via `profiles_update_own` + `GRANT UPDATE` à `authenticated` (`0001:30`) n’est pas bloqué par un trigger de rôle dans cette série. |
| 7 | Le superviseur conserve l’écriture sur `seances` (`seances_*_own`) | **VRAI** | `seances_insert_own`, `seances_update_own`, `seances_delete_own`, `seances_select_own` créées `0002:48-70` et non droppées ensuite (0009 ne droppe que `seances_admin_all` et `seances_select_member_inscrit`). |
| 8 | Tests : séance ou saison ? Admin ou superviseur ? Types ? | **PARTIEL** | Colonne `seance_id` (`0005:14`), pas de `saison_id`. Création UI : admin seul (`AdminTestsScreen.js:164`). RLS : admin **et** superviseur de la séance (`0009:422-440`). Types `hifz` / `sunnah` + lien `form_url` pour sunnah (`0016:8-19`). « حفاظ السنة » = type `sunnah` + Google Form (`0016:5-7`, `testsApi.js:271-278`). |
| 9 | Groupes par séance ; pièces jointes image/audio | **PARTIEL** | Groupe : `chat_groups.seance_id UNIQUE` (`0054:17`). Image : `messages.image_url` (`0006:12`) et `chat_group_messages.image_url` (`0054:41`), écrites par `messagesApi.js:406` et `chatGroupsApi.js:379`. Audio : **NON TROUVÉ**. |
| 10 | Push Expo, heures calmes 22 h–7 h, cadence des rappels | **PARTIEL** | Push Expo : `send-push/index.ts:16` et cron `notifications-push-dispatch` `* * * * *` (`0069:18-21`). Heures calmes **globales** 22:00–07:00 : posées en `0074:2` et `0074:30-31`, **retirées** en `0088:2-4` au profit d’un opt-in `quiet_hours_enabled` (défaut false, `0088:18`). Les colonnes `quiet_hours_start/end` ne sont pas créées dans la série officielle. Rappels de présence : cron d’abord `0 */6 * * *` (`0034:290-293`), **remplacé** par `*/15 * * * *` (`0072:143-146`), job `presence-reminder-check`. Relance progression : `0 9 * * *` UTC (`0087:310-313`). |
| 11 | Mode hors ligne | **PARTIEL** | Repli mock si Supabase échoue : `useSupervisorMembers.js:206-208`, `487`. `AsyncStorage` pour des marqueurs « vu » (`app/data/seenAt.js:1-40`) et reset dev (`AppContext.js:648`). File d’écritures hors ligne rejouée au retour réseau : **NON TROUVÉE**. |
| 12 | Module Mushaf / Tajwid | **ABSENT** | Aucune occurrence `mushaf` / `tajwid` dans `*.js`, `*.json`, `*.sql`. |
| 13 | Couleur principale | **VRAI** `#337D3D` | `app/constants/theme.js:1-3` (`primary` et `green`). Dégradé header membre `#2E7D32` / `#388E3C` (`theme.js:28`). |
| 14 | Navigation | **VRAI** | Menu latéral admin : `AdminSidebar` (`app/components/AdminSidebar.js:83`), branché sur les écrans admin (ex. `AdminDashboard.js:22`, `305`). Membre : `MemberBottomTabBar` interne (`MemberDashboardScreen.js:1120`, composant `ui.js:355`), pas un `createBottomTabNavigator` (aucune occurrence). Superviseur : état `tab` dans `SupervisorDashboard.js:57-63` et barre basse interne (`SupervisorDashboard.js:318`), onglets home / members / attendance / progress / messages (`SupervisorDashboard.js:265-302`). |
| 15 | `scripts/seed-supervisor-test.js` et `jour` | **FAUX** (incompatible avec l’enum attendu par le code) | Le script insère `jour: 'lundi'` (`seed-supervisor-test.js:99`). L’enum attendu par l’app est arabe : `JOUR_SEMAINE_VALUES` (`seancesApi.js:6-14`), et `isJourSemaineEnum` refuse le français (`supervisorHelpers.js:57-59`). `CREATE TYPE jour_semaine` **NON TROUVÉ** ; `0086:5` et `0033:8` le supposent NOT NULL / typé enum. `'lundi'` n’est pas dans la liste arabe. |
| 16 | Tests automatisés, ESLint, CI | **ABSENT** | 0 fichier `*.test.js` / `*.spec.js`. Pas de config ESLint. Pas de `.github/`. `package.json` sans script test/lint. |

---

## 7. Synthèse

### 7.1 Modules

| Module | État | Preuve |
|---|---|---|
| Auth / profils / rôles multiples | réalisé | `0001`, `0026`, `0082`, `app/constants/roles.js` |
| Inscription membre anonyme `pending` | réalisé | `0049` |
| Invitation + activation (membre et superviseur) | réalisé | `0013`, Edge `activate-invited-account` |
| Séances | réalisé | `0002` + alters ; enum `jour` non créé dans les migrations |
| Saisons | partiel | utilisée et altérée (`0039`, `0042`, `0080`) ; `CREATE TABLE` **NON TROUVÉ** dans la série officielle |
| Inscriptions membre↔séance | partiel | table + RLS oui ; deux index uniques contradictoires (`0003` et `0053`) |
| Présences | partiel | client + triggers de notif ; table, RLS et UNIQUE **NON TROUVÉS** dans la série officielle |
| Progression / objectifs | partiel | objectifs créés (`0057`) ; colonnes CdC de `progression` non créées par les migrations |
| Programmes de mémorisation | réalisé | `0040`, `0070` |
| Tests (hifz / sunnah) | réalisé côté admin | `0005`, `0012`, `0016`, `AdminTestsScreen.js` |
| Mode examen | absent | section 5 RG10 |
| Messagerie 1-à-1 RG6 | réalisé | `0006`, fermeture admin↔membre `0083` |
| Groupes par séance | réalisé | `0054`, `0064` |
| Pièces jointes audio | absent | section 6.9 |
| Alertes bloquantes | réalisé | `0014`, `BlockingAlertGate.js` ; audiences all/members/supervisors, pas par séance |
| Notifications push | réalisé | `0065`–`0069`, `send-push` |
| Heures calmes 22 h–7 h pour tous | absent (retiré) | remplacé par opt-in `0088` |
| Mushaf / Tajwid | absent | section 6.12 |
| Hors ligne transactionnel | absent | repli mock + AsyncStorage de lecture seulement |
| Tests auto / ESLint / CI | absent | section 6.16 |

### 7.2 Écarts code ↔ contraintes visibles dans les migrations

Il n’y a pas de cahier des charges versionné dans le périmètre lu (les docs obsolètes ont été exclus). Les écarts ci-dessous sont entre le **code** et les **contraintes réellement émises par `supabase/migrations/`**.

1. Le client écrit `nb_hizb_completes` / `tumun_courant` ; le seul `CREATE` de `progression` définit `juze` / `tumun` / `note` (`0004` vs `progressApi.js:237-241`).
2. Le client autorise plusieurs inscriptions `accepte` sur des saisons différentes (`membersApi.js:598-599`) ; l’index `0003` l’interdit au niveau membre.
3. Le client upsert les présences sur une clé unique qui n’est déclarée nulle part dans les migrations (`presenceApi.js:715`).
4. Le seed écrit `jour = 'lundi'` ; l’app n’accepte que les libellés arabes (`seed-supervisor-test.js:99` vs `seancesApi.js:6-14`).
5. `membersApi.js` lit `public.membres` après le `DROP` de `0076`.
6. `seasonStatsApi.js` lit `season_stats` dont le CREATE n’est pas dans la série officielle.
7. `account_status = 'inactive'` est un libellé client (`roles.js:131`) hors du CHECK `0001:17-18`.
8. L’UI ne crée les tests que côté admin, alors que la RLS superviseur le permet (`0009:436-440`).
9. Heures calmes « 22 h–7 h pour tout le monde » : le code final (`0088`) ne les applique que si l’utilisateur a `quiet_hours_enabled`.

### 7.3 Failles et incohérences

**Élevée**

- Auto-promotion possible : `GRANT UPDATE` sur `profiles` à `anon` et `authenticated` (`0001:30`) + `profiles_update_own` sans restriction de colonnes (`0001:38-40`) + **absence** de `profiles_guard_role` dans la série officielle. `0082` ne protège que l’`INSERT` du trigger d’inscription.
- `send-password-reset` et `activate-invited-account` sont documentées `--no-verify-jwt` et utilisent `service_role` sans JWT d’appelant (`send-password-reset/index.ts:3`, `52-57` ; `activate-invited-account/index.ts:6`, `91-92`). La seconde est bornée par l’existence d’une invitation ; la première génère un OTP pour n’importe quel e-mail connu, avec un rate-limit **en mémoire du processus** seulement.

**Moyenne**

- `seances_select_active_public` expose toutes les séances `active` à `anon` (`0024:17-22`).
- Index `inscriptions_membre_accepte_unique` (global) et `inscriptions_membre_saison_accepte_unique` (par saison) coexistent dans la série ; le second peut ne pas être créé si des doublons existent (`0053:47-49`).
- `messages_update_read` et la colonne `messages.read_at` sont supposées (`0083`) sans `CREATE` dans les migrations. Le `REVOKE UPDATE` + `GRANT UPDATE (read_at)` (`0083:108-109`) échoue si la colonne n’existe pas.
- `notification_preferences`, `saisons`, `presences`, `presence_rappels`, `season_stats`, `jour_semaine`, `profile_canonical_email` : objets utilisés sans création dans `supabase/migrations/`. Un rejeu à vide de ce dossier ne produit pas le schéma que l’app interroge.
- `0086:7` documente une UNIQUE `(saison_id, superviseur_id)` qui n’est pas créée. Le client affiche plusieurs séances par superviseur (`AdminSupervisorsScreen.js:60`).
- Policy `seance_planning_history_admin_all` FOR ALL sans `WITH CHECK` (`0033:37-46`).

**Faible**

- Commentaire `membersApi.js:720` pointe une « migration 0027 » qui, dans la série officielle, ne contient pas la policy de delete.
- `0082:5` cite `profiles_guard_role (0071)` alors que `0071_presence_absence_notifications.sql` ne définit pas cette fonction.
- Aucun test automatique, ESLint, ni CI (section 6.16).
- Lectures mortes de `membres` après `0076`.

---

## 8. Requêtes de vérification (à lancer dans Supabase, non exécutées ici)

```sql
-- Colonnes du schéma public
select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- Index (y compris partiels : indpred)
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- Contraintes
select c.conname,
       c.contype, -- p PK, f FK, u UNIQUE, c CHECK
       rel.relname as table_name,
       pg_get_constraintdef(c.oid) as def
from pg_constraint c
join pg_class rel on rel.oid = c.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
order by rel.relname, c.contype, c.conname;

-- Policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- Triggers
select event_object_schema, event_object_table, trigger_name,
       action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema in ('public', 'auth')
order by event_object_schema, event_object_table, trigger_name;

-- RLS activée ?
select n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- GRANT du rôle authenticated (une ligne par table public)
select c.relname as table_name,
       has_table_privilege('authenticated', format('public.%I', c.relname), 'SELECT') as can_select,
       has_table_privilege('authenticated', format('public.%I', c.relname), 'INSERT') as can_insert,
       has_table_privilege('authenticated', format('public.%I', c.relname), 'UPDATE') as can_update,
       has_table_privilege('authenticated', format('public.%I', c.relname), 'DELETE') as can_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- Points précis de cet audit
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'inscriptions_membre_accepte_unique',
    'inscriptions_membre_saison_accepte_unique',
    'seances_superviseur_idx'
  );

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.seances'::regclass
  and pg_get_constraintdef(oid) ilike '%superviseur%';

select proname, n.nspname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where proname in ('profiles_guard_role', 'messages_pair_authorized', 'handle_new_user',
                  'profile_canonical_email', 'in_project_quiet_hours');

select t.typname, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where t.typname = 'jour_semaine'
order by e.enumsortorder;

select jobname, schedule, command
from cron.job
where jobname in (
  'notifications-push-dispatch',
  'presence-reminder-check',
  'progression-relance-check'
);
```
