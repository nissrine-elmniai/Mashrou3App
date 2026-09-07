-- MIGRATION 0047 — droits INSERT/UPDATE sur seance_planning_history
-- Sans ces grants, l'admin ne peut pas archiver le planning lors d'un
-- changement d'heure (heure_debut / heure_fin) → « لا صلاحية كافية ».

grant select, insert, update, delete on table public.seance_planning_history to authenticated;

drop policy if exists seance_planning_history_admin_all on public.seance_planning_history;
create policy seance_planning_history_admin_all
  on public.seance_planning_history
  for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists seance_planning_history_select_superviseur on public.seance_planning_history;
create policy seance_planning_history_select_superviseur
  on public.seance_planning_history
  for select
  to authenticated
  using (
    exists (
      select 1 from public.seances s
      where s.id = seance_planning_history.seance_id
        and s.superviseur_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
