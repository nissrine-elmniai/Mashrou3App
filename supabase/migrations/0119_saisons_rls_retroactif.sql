-- 0119 — Rétroactif : RLS et grants de `saisons` + lecture visiteur
alter table public.saisons enable row level security;

drop policy if exists saisons_admin_all on public.saisons;
create policy saisons_admin_all on public.saisons
  for all
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists saisons_select_active_public on public.saisons;
create policy saisons_select_active_public on public.saisons
  for select
  using (active = true or registration_open = true);

grant select, insert, update, delete on public.saisons to authenticated;
grant select on public.saisons to anon;

notify pgrst, 'reload schema';