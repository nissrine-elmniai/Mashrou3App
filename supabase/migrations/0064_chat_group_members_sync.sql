-- 0064_chat_group_members_sync.sql
-- Le trigger 0054 ajoute un membre au groupe de NEW.seance_id mais ne lit
-- jamais OLD.seance_id et n'écoute pas DELETE. Résultat : les appartenances
-- s'accumulent, un membre reste joignable dans les groupes de ses anciennes
-- séances, et son ancien superviseur peut encore y lire et y écrire.
-- RG3 : un membre appartient à une seule séance à la fois.

begin;

-- 1. Retrait du groupe de l'ancienne séance sur changement de seance_id.
create or replace function private.inscriptions_unsync_old_chat_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.seance_id is not null
     and (tg_op = 'DELETE' or new.seance_id is distinct from old.seance_id) then
    delete from public.chat_group_members m
    using public.chat_groups g
    where g.id = m.group_id
      and g.seance_id = old.seance_id
      and m.membre_id = old.membre_id
      and m.role <> 'admin';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_inscriptions_unsync_old_chat_group
  after update of seance_id or delete on public.inscriptions
  for each row execute function private.inscriptions_unsync_old_chat_group();

-- 2. Nettoyage des appartenances sans inscription acceptée correspondante.
delete from public.chat_group_members m
using public.chat_groups g
where g.id = m.group_id
  and m.role <> 'admin'
  and not exists (
    select 1 from public.inscriptions i
    where i.membre_id = m.membre_id
      and i.seance_id = g.seance_id
      and i.statut = 'accepte'
  );

commit;

notify pgrst, 'reload schema';