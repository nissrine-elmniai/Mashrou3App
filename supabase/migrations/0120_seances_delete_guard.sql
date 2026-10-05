-- 0120 — Interdire la suppression d'une séance qui a des membres inscrits
create or replace function private.seances_block_delete_with_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.inscriptions i
    where i.seance_id = old.id
      and i.statut = 'accepte'::public.inscription_statut_enum
  ) then
    raise exception 'لا يمكن حذف حصة بها أعضاء — انقل الأعضاء إلى حصة أخرى أولاً'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function private.seances_block_delete_with_members() from public, anon, authenticated;

drop trigger if exists seances_block_delete_with_members on public.seances;
create trigger seances_block_delete_with_members
  before delete on public.seances
  for each row
  execute function private.seances_block_delete_with_members();