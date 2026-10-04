# Audit inscription et réinscription

Lecture du code au 2026-10-04. `docs/cycle-de-vie-saison.md` est absent du dépôt (recherché sous `docs/` et `Mashrou3App/docs/`). Les faits serveur du brief ne sont pas re-vérifiés ; ils servent de cadre. Aucune migration, aucun changement de code.

Contexte base (donné) : `member_applications` et `inscriptions` vides ; seule saison active `s_1791121475092_3906`, type `summer`, `registration_open = true`. Bug 0110 en cours : `auto_affecter_seance_on_activation` déclarait `v_saison_id uuid` alors que les ids sont `s_…` ; une activation **avec** `seance_id` échoue en `22P02` et annule la transaction.

---

## 1. Flux

### Nouvelle inscription (`kind = join`)

Appelant : visiteur **anon** (`LoginScreen.js` 137 → `Register`, `RootNavigator.js` 68). Pas de session.

```
RegisterScreen (anon)
  → submitMemberApplication                    AppContext.js 680
  → insertPendingMemberApplication             memberApplicationsApi.js 286
  → INSERT member_applications status=pending  kind=join
       id client r_<ms>_<n>                    AppContext.js 102–103, 732
       season_id = getActiveRegularSeason      RegisterScreen.js 197
       seance_id = choix du formulaire         193, 241 (obligatoire)
       genre, email, form_answers              buildApplicationRow 142–175
  → trigger garde : user_id forcé à auth.uid() = null (anon)

Admin AdminRegistrationsScreen.acceptAndInvite  155
  → reviewRegistration(..., ACCEPTED)          AppContext.js 1453
  → upsertMemberApplication                    mapStatus ACCEPTED → 'invited'  23–24
  → UPDATE status=invited, accepted_at posé    187–188
  → sendMemberAcceptEmail (Resend, pas Auth)   sendInviteEmail.js 130
  → PAS d'INSERT inscriptions à cette étape
  → auto_affecter ne tourne pas (status ≠ activated)

Candidat « عضو جديد » LoginScreen.js 144
  → ActivateAccountScreen → signUpWithProfile  auth.js 489
  → Edge Function activate-invited-account     auth.js 419
     (vérifie status=invited, commentaire 1606)
  → le client NE fait PAS d'UPDATE member_applications
     il marque seulement le cache local activated  AppContext.js 1647–1658
  → passage réel à activated : trigger
     link_member_application_on_profile (fait serveur)
  → auto_affecter crée inscriptions.statut=accepte
     SI seance_id est non null → bug 0110, transaction annulée
```

`season_id` peut être null seulement s'il n'existe **aucune** saison `active`. Aujourd'hui l'été est active : `getActiveRegularSeason` (`seasonScope.js` 19–24) prend la saison regular active, sinon `active[0]`. Résultat : `season_id = s_1791121475092_3906`. `seance_id` ne peut pas être null si la validation client passe (`RegisterScreen.js` 241, `AppContext.js` 705).

### Réinscription (`kind = season_renewal`)

Appelant : membre **authenticated**. Onglet `التسجيل` (`MemberDashboardScreen.js` 1247).

```
MemberRegistrationPanel
  → saisons ouvertes = active ET registration_open   seasonScope.js 32–39
  → aujourd'hui : regular vide, été ouvert
  → submitSeasonRegistration                         AppContext.js 1187
  → kind toujours SEASON_RENEWAL                     1275
     (aucun test « existe-t-il déjà une demande »)
  → user_id = auth uid (uuid)                        1222, 176–185
  → season_id = saison du bouton (été)               panel 232–241
  → seance_id obligatoire                            AppContext.js 1233
  → INSERT pending

Admin « قبول التسجيل »                              AdminRegistrationsScreen.js 156–161
  → reviewRegistration ACCEPTED
  → upsert status=activated direct                   AppContext.js 1384–1392
     memberApplicationsApi.js 351–361
  → seance_id repart dans la ligne                   buildApplicationRow 168
  → auto_affecter (seance_id non null) → 22P02
     l'upsert échoue, l'admin voit l'erreur
  → pas d'étape invited, pas d'e-mail, pas de nouveau compte
```

Le critère `season_renewal` ne dépend pas des lignes encore en base. Après le reset, une réinscription envoyée par un membre connecté reste `season_renewal`. Le contrôle de doublon (`findOpenSeasonRenewal`, `memberApplicationsApi.js` 234) ne trouve rien : la première demande passe.

Préremplissage : le formulaire ne relit ni `profiles` ni une ancienne demande. Seul le genre vient de `currentUser.gender` (`MemberDashboardScreen.js` 76–79, 1251). Nom, e-mail, téléphone sont recopiés à l'envoi depuis l'utilisateur en mémoire (`AppContext.js` 1282–1292), pas affichés dans le formulaire.

Choix de séance : `getActiveSeancesByGenre` (`seancesApi.js` 102). SQL : `statut = active`, et si `saisonId` est fourni `saison_id = id OU saison_id IS NULL` (116–117). Le genre `ذكر` / `أنثى` est filtré **en JavaScript** (133–135). `registration_open` n'est pas lu ici. Il est contrôlé seulement au moment de `submitSeasonRegistration` (`AppContext.js` 1200–1213).

---

## 2. Écrans

| Écran | Rôle | Source | États gérés | Fichier:ligne |
|---|---|---|---|---|
| RegisterScreen | anon | formulaire + `getActiveSeancesByGenre` | saisie, succès « تم إرسال الطلب », suivi local `قيد المراجعة` / libellés `roles.js` 77–81 | `RegisterScreen.js` 197, 252, 284–295 |
| ActivateAccount | anon | Edge `activate-invited-account` | code 6 chiffres, compte créé | `auth.js` 409–430 ; `AppContext.js` 1500 |
| MemberRegistrationPanel | membre | `getOpenRegistrationSeasons` + séances par genre | été ouvert / regular fermé ; aucune حصة selon genre ; genre inconnu | `MemberRegistrationPanel.js` 107–112, 254–294 ; `MemberDashboardScreen.js` 474–475 |
| Accueil membre | membre | `getMyCurrentInscription` (accepte + saisons `active`) | sans séance : « لم يتم تعيينك في حصة بعد » ; activités `myRegs` si `seasonId` = saison « regular » de repli | `messagesApi.js` 136–158 ; `SessionCard.js` 32 ; `MemberDashboardScreen.js` 849–850 |
| Profil membre | membre | idem séance ; position = progression toutes saisons | non inscrit = pas de séance, pas de date | `MemberProfileScreen.js` (charge `getMyCurrentInscription`) |
| AdminRegistrations | admin | `listMemberApplications` → cache | filtres tout / انضمام / إعادة تسجيل ; قيد الانتظار / المقبولة / المرفوضة ; type = saison active (été aujourd'hui) | `AdminRegistrationsScreen.js` 60–61, 88–131, 256–266 |
| Annuaire | admin | `getAllAcceptedInscriptions` + `fetchActivatedMemberIdsForSeason` + `fetchSeasonDirectory` | المسجّلون = inscription accepte dont la séance n'est pas archivée dans la saison active préférée ; مسجّلون بدون حصة = demande `activated` sans cette inscription ; غير مسجّلين = le reste | `AdminMembersScreen.js` 68–71, 136–141, 201–208 ; `membersApi.js` 738–743, 832–844 |
| Fiche membre | admin / superviseur | `loadCurrentMemberSeance` = inscription accepte dans une saison active, tout type | sans inscription : « لم يتم تعيينه في حصة بعد » | `membersApi.js` 754–826 |
| Superviseur (membres, présence, messages) | superviseur | `getSeanceMembers` : `inscriptions` `accepte` de **sa** séance | ne liste pas les demandes ; pas d'action sur `member_applications` | `membersApi.js` 238–260 |

Le superviseur ne voit pas les demandes. Aucun écran `app/screens/supervisor` n'appelle `member_applications`. RLS : pas d'INSERT/UPDATE `inscriptions` pour lui ; DELETE seulement si `accepte` (`removeMemberFromSeance`, `membersApi.js` 876).

---

## 3. Écritures client

### `member_applications`

| Appel | Opération | Statut écrit | Fichier:ligne |
|---|---|---|---|
| `insertPendingMemberApplication` | INSERT | `pending` | `memberApplicationsApi.js` 286–301 |
| `upsertMemberApplication` | UPSERT `onConflict: id` | `invited` si l'app dit ACCEPTED (join) ; `activated` si renouvellement accepté ; `rejected` si refus | 343–374 ; `AppContext.js` 1327, 1384, 1453 |
| `listMemberApplications` / `findOpenSeasonRenewal` / `fetchActivatedMemberIdsForSeason` | SELECT | — | 115, 234, 832 |

Le cache local passe une demande `invited` à `activated` **sans** upsert (`AppContext.js` 1647 et 1760). Ce n'est pas une écriture Supabase.

### `inscriptions`

| Appel | Opération | Fichier:ligne |
|---|---|---|
| `updateMemberSeance` | UPDATE `seance_id` si une ligne `accepte` existe déjà pour la saison | `membersApi.js` 671–674 |
| `updateMemberSeance` `createIfMissing` | INSERT `membre_id`, `seance_id`, `statut: accepte` (pas de `saison_id` : le trigger le pose) | 700–707 |
| `removeMemberFromSeance` | DELETE par id | 886 |

Aucun autre `insert` / `update` / `upsert` / `delete` client sur `inscriptions`. Les autres `.from("inscriptions")` sont des SELECT (`accepte` uniquement).

`en_attente` et `refuse` (enum inscriptions) ne sont écrits nulle part. Les `refuse` trouvés dans `testsApi.js` concernent les invitations de test, pas `inscriptions`.

### Lien avec le bug 0110

- Join : l'admin écrit `invited`, pas `activated`. `seance_id` est déjà sur la ligne depuis l'INSERT pending. L'activation réelle est le trigger profil, pas le client. Si `auto_affecter` lève `22P02`, la transaction qui passe à `activated` est annulée : le compte n'est pas créé, l'Edge Function renvoie une erreur (`auth.js` 436–437, 471–475).
- Renouvellement : l'admin envoie `activated` **avec** `seance_id` (`buildApplicationRow` 168). C'est exactement le cas qui échoue. Le client ne crée pas l'inscription lui-même et n'avale pas l'erreur : `upsertMemberApplication` renvoie `mapSupabaseAuthError` (`memberApplicationsApi.js` 431), `reviewRegistration` remonte `sync.error` (`AppContext.js` 1394–1398), l'écran fait `Alert.alert("خطأ", result.error)` (`AdminRegistrationsScreen.js` 163–164).
- Une activation a pu réussir **avant** ce bug, ou si `seance_id` était null (l'autre branche d'`auto_affecter`, non cassée selon le brief). Aujourd'hui les deux formulaires exigent une séance. Contournement encore dans le client : l'admin peut INSERT une inscription à la main via `updateMemberSeance` (`createIfMissing`, `membersApi.js` 700). Cet INSERT ne passe pas par `auto_affecter`.

Erreurs affichées : message mappé (RLS, doublon, table absente) ou `error.message` brut si aucune règle ne matche (`supabase.js` 94). L'écran admin, au **chargement** seulement, remplace tout par « تعذّر تحميل الطلبات » (`AdminRegistrationsScreen.js` 73). La soumission membre affiche `result.error` dans `Alert.alert` (`RegisterScreen.js` 255, `MemberDashboardScreen.js` 989).

---

## 4. « Inscrit »

Règle de référence : au moins une `inscriptions` `accepte` dont `saison_id` est une saison `active = true`, tout type.

| Endroit | Règle réelle | Écart |
|---|---|---|
| `getMemberActiveEnrollment` / `getMyActiveEnrollment` / `loadCurrentMemberSeance` | référence | `membersApi.js` 749–826 |
| `getMyCurrentInscription` | `accepte` + saison active + séance jointe présente | exige une séance, pas seulement la ligne | `messagesApi.js` 131–158 |
| Annuaire `isCurrentSeanceInscription` | même saison que `fetchSeasonDirectory.activeSeason` (regular sinon n'importe quelle active) **et** séance non `archivee`. Les lignes viennent déjà de `getAllAcceptedInscriptions` | ignore une inscription `accepte` dont la séance est archivée ou absente ; ne regarde pas les autres saisons actives | `membersApi.js` 738–743 ; `saisonsApi.js` 143–146 ; `AdminMembersScreen.js` 201–208 |
| Annuaire « بدون حصة » | demande `status=activated` pour cette saison, sans l'inscription ci-dessus | ce n'est pas « non inscrit » au sens référence | `membersApi.js` 844 ; `AdminMembersScreen.js` 68–71 |
| Onglet التسجيل | `active && registrationOpen`, par type | une demande `pending` n'empêche pas d'afficher le formulaire | `seasonScope.js` 32–39 |
| Activités accueil | `getActiveRegularSeason` (repli sur l'été s'il est la seule active) | une demande d'une autre saison active serait masquée | `MemberDashboardScreen.js` 849–850 |
| Cache `registrations` | statut de **demande**, pas d'`inscriptions` | `AppContext.js` 204, 244, 454–461 |

Aujourd'hui, tables vides : annuaire = tous `غير مسجّلين` ; cartes séance vides. Cohérent avec la règle.

---

## 5. État local et legacy

| Élément | État |
|---|---|
| AsyncStorage `registrations` | **Actif.** Chargé au démarrage (`AppContext.js` 244), réécrit à chaque changement (329–334). Remplacé par le distant si la lecture réussit, y compris si la liste est vide (454–461). Conservé si le réseau échoue (409). |
| `submitSeasonRegistration` | **Actif.** Seul chemin de réinscription. |
| `reviewRegistration` | **Actif.** Seul chemin d'acceptation / refus admin. |
| `submitMemberApplication` | **Actif.** Seul chemin `join`. |
| `announceRegistrationForm`, `setRegistrationOpen`, `createSeason` | Code vivant dans `AppContext.js`, **plus aucun écran branché** ne les appelle sauf `AdminSummerSchoolScreen`. |
| `AdminSummerSchoolScreen` | **Mort pour la navigation.** Commentaire d'obsolescence ligne 1–2. Absent de `RootNavigator.js`. La création d'été passe par `AdminNewSeasonScreen` → `startNewSeason` (113). |
| `RegistrationStepper` | **Mort.** Jamais importé. |

---

## 6. Cas limites (comportement actuel)

1. **Deux `join` pour le même e-mail.** Aucune unicité (fait serveur). Le client ne bloque que le cache local téléphone + saison (`AppContext.js` 720–727). Deux INSERT anon passent. L'admin peut inviter les deux. Le trigger profil n'en liera qu'une au compte.
2. **`join` et `season_renewal` pour la même personne.** Chemins indépendants. Un membre connecté envoie `season_renewal` ; le même e-mail peut encore envoyer un `join` depuis l'écran public. Rien ne les relie.
3. **Nouvelle demande après refus.** Le filtre de doublon ignore `rejected` (`AppContext.js` 1228, `findOpenSeasonRenewal` 249). Un nouveau `pending` est autorisé. Conforme à l'index (hors `rejected`).
4. **Superviseur retire le membre puis réinscription dans la même saison.** `removeMemberFromSeance` efface la ligne `inscriptions` et ne touche pas la demande (`membersApi.js` 874). La demande reste `activated`. L'index unique `season_renewal` (e-mail, saison) hors `rejected` **refuse** un nouvel INSERT. Réécrire `activated` ne redéclenche pas `auto_affecter` (trigger sur le passage de statut, fait serveur). Le membre est bloqué. Contournement client existant : l'admin recrée l'inscription avec `updateMemberSeance`.
5. **Changement de séance admin.** `updateMemberSeance` fait un UPDATE de `inscriptions.seance_id` (`membersApi.js` 674). Il ne modifie pas `member_applications.seance_id`.
6. **Séance supprimée.** FK `ON DELETE SET NULL` (fait serveur) : la demande garde `seance_id` null. L'inscription, elle, est en CASCADE sur la séance : la ligne `inscriptions` disparaît. L'annuaire classe alors le membre en « بدون حصة » s'il a une demande `activated`.
7. **Inscriptions fermées entre l'ouverture et l'envoi.** Réinscription : `submitSeasonRegistration` revérifie `active && registrationOpen` (1200–1213) et renvoie « باب التسجيل مغلق… ». Adhésion publique : `submitMemberApplication` **ne revérifie pas** (`AppContext.js` 714, commentaire « toujours ouverte »).
8. **Profil membre + superviseur.** `activateMemberAccount` refuse un e-mail déjà superviseur ou admin (`AppContext.js` 1683–1696). Un compte déjà membre qui ouvre l'onglet التسجيل envoie quand même un `season_renewal`. Le superviseur ne gère pas les demandes.
9. **Ancienne app.** Si la colonne `kind` manque, l'INSERT retire `kind` (`memberApplicationsApi.js` 208–216). À la lecture, un `pending` avec `user_id` est classé `season_renewal` (44–47). Un `join` sans `seance_id` (ancienne app) activerait la branche d'`auto_affecter` sans `seance_id` — la seule que le brief dit non touchée par `22P02`.

---

## 7. Incohérences

### Bloquant (avant de rouvrir les réinscriptions)

- Accepter une réinscription écrit `activated` avec `seance_id`. Tant que 0110 n'est pas en base, `auto_affecter` annule l'acceptation (`memberApplicationsApi.js` 168, 351–361). Aucune inscription n'est créée, et l'admin voit l'erreur Postgres (souvent brute).
- Après un retrait de séance par le superviseur, une nouvelle réinscription sur la même saison est refusée par l'unicité, et la demande `activated` ne recrée pas l'inscription. Il faut décider le contournement **avant** que ce cas existe (aujourd'hui les tables sont vides, donc le premier cycle passera ; le second, non).

### Important

- L'adhésion publique s'attache à la seule saison active, donc à l'école d'été (`seasonScope.js` 19–24, `RegisterScreen.js` 197). Rouvrir les réinscriptions sans fermer l'adhésion publique fait entrer les nouveaux dans l'été.
- L'onglet membre ne montre pas « en attente », « refusé » ou « invité ». Après envoi, seul un `Alert` « تم إرسال طلب التسجيل » (`MemberDashboardScreen.js` 992). Une deuxième soumission part jusqu'au refus d'unicité.
- Le statut applicatif `accepted` n'existe pas en base. Il est réécrit en `activated` pour le renouvellement et en `invited` pour le join (`memberApplicationsApi.js` 23–28, 60–66). L'onglet « المقبولة » mélange invited, activated et l'alias local accepted (`AdminRegistrationsScreen.js` 119–124).
- L'annuaire « inscrit » exige une séance non archivée. La fiche membre (`getMemberActiveEnrollment`) non. Un membre `accepte` sans séance valide n'a pas le même libellé des deux côtés.
- `getActiveSeancesByGenre` inclut les séances `saison_id` null (`seancesApi.js` 117) et filtre le genre seulement côté client.
- L'adhésion publique ne teste pas `registration_open`.

### Mineur

- `AdminSummerSchoolScreen` et `RegistrationStepper` ne sont plus montés.
- L'e-mail d'acceptation dit « الطالب » (`sendInviteEmail.js` 134), masculin fixe.
- Le cache local peut afficher `activated` avant que la synchro distante le contredise (`AppContext.js` 1647 puis 454–461).
- `accepted_at` est écrit aussi pour `invited` (`memberApplicationsApi.js` 187–188) alors que la colonne de statut n'a pas la valeur `accepted`.

---

## 8. Questions ouvertes

1. L'école d'été actuelle doit-elle accepter les **nouveaux** (`join`) ou seulement les membres déjà en compte ?
2. Après 0110, l'inscription `accepte` reste-t-elle créée **uniquement** par `auto_affecter`, ou l'admin doit-il aussi pouvoir la poser à la main (`updateMemberSeance`) ?
3. Un membre retiré de sa séance dans la même saison : nouvelle demande, réouverture de la demande `activated`, ou seulement un INSERT admin sur `inscriptions` ?
4. Le membre doit-il voir l'état de sa demande (attente / refus) dans l'onglet التسجيل, ou l'alerte suffit-elle ?
5. Deux demandes `join` pour le même e-mail : laquelle devient le compte ?

---

## Résumé

La réinscription est le chemin membre connecté : INSERT `pending` / `season_renewal`, puis l'admin upsert `activated` avec la séance choisie. Ce upsert déclenche `auto_affecter` et tombe sur le bug 0110 tant qu'il n'est pas corrigé. L'adhésion nouvelle est un autre chemin, anon, `join`, puis `invited`, puis Edge Function ; l'inscription n'existe qu'au passage `activated` par le trigger profil. Aujourd'hui la seule saison active est l'été, et le formulaire public s'y rattache. L'onglet membre ne reflète pas l'état de la demande. L'annuaire et la fiche ne calculent pas « inscrit » de la même façon. Retirer un membre puis le réinscrire dans la même saison est bloqué par l'unicité de la demande `activated`.
