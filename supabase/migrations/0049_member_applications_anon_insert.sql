-- MIGRATION 0049 — rétablir INSERT public sur member_applications
-- Erreur vue côté app : "permission denied for table member_applications"
-- (soumission du formulaire d'intégration sans compte = rôle anon)

grant usage on schema public to anon, authenticated;

grant insert on table public.member_applications to anon;
grant select, insert, update on table public.member_applications to authenticated;

-- Politique RLS : insertion publique uniquement en statut pending
drop policy if exists "member_applications_anon_insert_pending" on public.member_applications;
create policy "member_applications_anon_insert_pending"
  on public.member_applications for insert
  to anon, authenticated
  with check (status = 'pending');

notify pgrst, 'reload schema';
