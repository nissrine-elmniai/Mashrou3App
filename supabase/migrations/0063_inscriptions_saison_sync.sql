begin;

-- 1. Suppression des 3 inscriptions corrompues (séance archivée الاربعاء مساء,
--    saison_id éditée à la main avec '\r\n', ce qui contournait l'index unique).
delete from public.inscriptions
where id in (
  '82c8b2f8-6b1c-455d-86ae-517746185782',
  '4abff141-4f3a-43f4-b6d2-7f32153cf86d',
  '4a9d7862-28bc-4ed7-bb07-3680f9542c34'
);

-- 1b. Nettoyage du groupe de chat de cette séance (le trigger chat ne gère pas DELETE).
delete from public.chat_group_members m
using public.chat_groups g
where g.id = m.group_id
  and g.seance_id = 'e5dc43f1-f50d-4dff-a061-4fb9cb65f77e'
  and m.membre_id in (
    '01835931-ba33-447b-84d7-52870aa8bbdb',
    '14d5fd03-7f62-4df0-8b99-0f45ddd7b14e',
    '33b2256f-5706-45ae-958c-7304f910682d'
  )
  and m.role <> 'admin';

-- 2. Remplacement des deux triggers doublons par un seul, qui couvre aussi
--    la modification directe de saison_id.
drop trigger if exists trg_sync_inscription_saison on public.inscriptions;
drop trigger if exists trg_sync_inscription_saison_id on public.inscriptions;
drop function if exists public.sync_inscription_saison();
drop function if exists public.sync_inscription_saison_id();

create or replace function private.inscriptions_sync_saison()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- La saison d'une inscription est toujours celle de sa séance.
  if new.seance_id is not null then
    select s.saison_id into new.saison_id
    from public.seances s
    where s.id = new.seance_id;
  end if;
  return new;
end;
$$;

create trigger trg_inscriptions_sync_saison
  before insert or update of seance_id, saison_id on public.inscriptions
  for each row execute function private.inscriptions_sync_saison();

-- 3. Garde-fou : aucun espace ni retour à la ligne dans les identifiants de saison.
alter table public.seances
  add constraint seances_saison_id_no_ws
  check (saison_id is null or saison_id = btrim(saison_id, E' \r\n\t'));

alter table public.inscriptions
  add constraint inscriptions_saison_id_no_ws
  check (saison_id is null or saison_id = btrim(saison_id, E' \r\n\t'));

commit;