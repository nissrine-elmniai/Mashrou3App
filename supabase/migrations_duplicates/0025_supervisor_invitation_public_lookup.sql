-- MIGRATION 0025 — lecture d'une invitation superviseur en attente à l'inscription
-- À exécuter après 0013_supervisor_invitations.sql
--
-- Problème : RLS « admin only » sur supervisor_invitations empêche l'invité
-- (session anon) de vérifier sa dعوة avant signUp → « لا توجد دعوة مشرف ».
-- Solution : RPC security definer qui ne renvoie qu'une ligne pending pour
-- l'e-mail demandé (pas d'énumération de toutes les invitations).

create or replace function public.get_pending_supervisor_invitation(p_email text)
returns table (
  id text,
  email text,
  first_name text,
  last_name text,
  group_name text,
  status text,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    i.id,
    i.email,
    i.first_name,
    i.last_name,
    i.group_name,
    i.status,
    i.created_at
  from public.supervisor_invitations i
  where lower(trim(i.email)) = lower(trim(p_email))
    and i.status = 'pending'
  order by i.created_at desc
  limit 1;
$$;

revoke all on function public.get_pending_supervisor_invitation(text) from public;
grant execute on function public.get_pending_supervisor_invitation(text) to anon, authenticated;

notify pgrst, 'reload schema';
