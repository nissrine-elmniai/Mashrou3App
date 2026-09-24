-- 0047 — member_programs : type de programme (hifz / mouraja3a)
--
-- Contexte : la position du membre dans le Coran (table progression) sera
-- desormais incrementee par les programmes de memorisation uniquement.
-- Les programmes de revision ne doivent pas faire monter cette position :
-- reviser une portion deja memorisee n'ajoute rien au total memorise.
--
-- Les 2 programmes existants ("جزء عم" et "برنامج الجزء الأول") sont des
-- programmes de memorisation : le defaut 'hifz' les classe correctement.

alter table public.member_programs
  add column if not exists type text not null default 'hifz';

alter table public.member_programs
  drop constraint if exists member_programs_type_check;

alter table public.member_programs
  add constraint member_programs_type_check
  check (type in ('hifz', 'mouraja3a'));

notify pgrst, 'reload schema';