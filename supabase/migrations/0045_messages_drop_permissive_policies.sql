-- 0045 — messages : suppression des policies permissives qui contournent RG6
--
-- Les policies RLS d'une même commande se combinent en OR. `messages_select_own`
-- et `messages_insert_own` ne vérifiaient pas `private.messages_pair_authorized()`,
-- ce qui rendait inopérantes les policies `_authorized` correspondantes :
-- n'importe quel utilisateur pouvait écrire à n'importe quel autre.
-- Même motif que le conflit corrigé en 0028/0029 sur `inscriptions`.
--
-- Vérifié avant migration : les 9 messages existants passent tous
-- `messages_pair_authorized()`. Aucun trafic légitime n'est bloqué.
--
-- Effet de bord assumé : l'admin perd la lecture globale de tous les messages
-- (`OR is_admin()` de messages_select_own). Il ne voit plus que les
-- conversations où il est expéditeur ou destinataire, conformément à RG6.
--
-- `messages_update_read` est conservée : elle est correctement scopée au
-- destinataire et servira au marquage `read_at`.

drop policy if exists messages_select_own on public.messages;
drop policy if exists messages_insert_own on public.messages;
