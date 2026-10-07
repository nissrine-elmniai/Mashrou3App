# Chat admin

## Flux de la liste

`AdminChatScreen` (menu المحادثات, ou le bouton flottant `AdminMessagesFab`) :

1. `getAdminChatSupervisors` lit `profiles` (`role = supervisor` ou `roles` contient `supervisor`). Sans saison active, la fonction renvoie une liste vide et l'écran ne charge rien d'autre côté contacts.
2. `useInboxThreads({ includeStatus: true })`, branché dans `useAdminSidebar`, appelle `getInboxThreads` sur `messages` (les 300 derniers où le compte est expéditeur ou destinataire), avec `roles` et `account_status` sur les profils embarqués.
3. `mergeInboxRows` puis `filterAdminInboxRows` produisent les lignes. L'ouverture va vers `ChatConversationScreen` (direct uniquement ; pas de groupe).

Le badge du menu et du bouton flottant additionne les non-lus des fils qui passent le même filtre.

## RG6 en base

`private.messages_pair_authorized` (migration `0128_messages_rg6_admin_membre.sql`) autorise :

- membre → superviseur de sa séance (`seance_id` obligatoire) ;
- superviseur → membre de sa séance (`seance_id` obligatoire) ;
- superviseur ↔ admin (`seance_id` facultatif).

Admin ↔ membre est refusé. La policy `messages_update_read` ne laisse marquer lu que le destinataire.

Ne jamais recoller les migrations `0017` ni `0026` : elles réintroduisent le couple admin ↔ membre.

## Décisions

- D1 : la liste affiche tous les superviseurs actifs, même sans séance.
- D2 : un superviseur est un profil dont `roles` contient `supervisor` ou dont `role = supervisor`.
- D3 : un `account_status` renseigné et différent de `active` est masqué, y compris s'il reste d'anciens messages.
- D4 : les membres sans rôle superviseur restent masqués. La garantie est la RLS (0128), pas le filtre d'écran.
- D5 : le plafond de 300 messages de `getInboxThreads` est conservé.
- Pas de saison active : la liste des contacts reste vide.

## Limites connues

- L'aperçu et le compteur de non-lus ne portent que sur les 300 derniers messages du compte. `messages` est vidée à chaque `start_new_season`.
- Les fichiers du bucket public `chat-group-avatars` ne sont pas supprimés avec les groupes : la policy storage n'autorise que le superviseur de la séance. Ils restent orphelins.
- Les colonnes legacy `from_user_id`, `to_user_id` et `body` sont remplies par le trigger `messages_sync_legacy_columns`. L'application lit et écrit `sender_id`, `recipient_id` et `contenu`.
