-- 0113_inscriptions_member_applications_cleanup.sql
-- Doublons d'index et de policy. Ne touche pas à
-- inscriptions_membre_id_saison_id_key.
--
-- inscriptions_membre_saison_accepte_unique n'est supprimé que si aucune
-- fonction public/private ne cible cet index partiel via
-- ON CONFLICT (membre_id, saison_id) WHERE …
-- Dans le dépôt, seul 0101 avait ce prédicat. La fonction en base et 0110
-- font ON CONFLICT (membre_id, saison_id) DO NOTHING, sans WHERE : elles
-- s'appuient sur la contrainte UNIQUE (membre_id, saison_id).
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Un seul script = une transaction.
-- Exécuter d'abord la requête de contrôle du message (fonctions hors dépôt).

drop index if exists public.idx_inscriptions_seance;
drop index if exists public.idx_inscriptions_membre;

drop policy if exists member_applications_anon_insert_pending
  on public.member_applications;

do $guard$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* 'on conflict\s*\(\s*membre_id\s*,\s*saison_id\s*\)\s*where'
  ) then
    raise warning 'ATTENTION: inscriptions_membre_saison_accepte_unique conservé — une fonction utilise ON CONFLICT (membre_id, saison_id) WHERE';
  else
    execute 'drop index if exists public.inscriptions_membre_saison_accepte_unique';
  end if;
end
$guard$;
