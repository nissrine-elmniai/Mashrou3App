-- MIGRATION 0032 — rattacher la séance au superviseur (invitations pending ou activated)
-- À exécuter dans Supabase SQL Editor après 0031

create or replace function public.assign_supervisor_seance_from_invitation(
  p_profile_id uuid,
  p_canonical_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
begin
  if p_profile_id is null or p_canonical_email is null or trim(p_canonical_email) = '' then
    return;
  end if;

  select i.id, i.group_name, i.seance_id, i.status
  into v_inv
  from public.supervisor_invitations i
  where lower(trim(i.email)) = lower(trim(p_canonical_email))
    and i.status in ('pending', 'activated')
  order by
    case when i.seance_id is not null then 0 else 1 end,
    case when i.status = 'activated' then 0 else 1 end,
    i.updated_at desc nulls last,
    i.created_at desc
  limit 1;

  if not found then
    return;
  end if;

  if v_inv.seance_id is not null then
    update public.seances
    set superviseur_id = p_profile_id
    where id = v_inv.seance_id
      and statut = 'active'
      and (superviseur_id is null or superviseur_id = p_profile_id);
  elsif v_inv.group_name is not null and trim(v_inv.group_name) <> '' then
    update public.seances s
    set superviseur_id = p_profile_id
    where lower(trim(s.nom)) = lower(trim(v_inv.group_name))
      and s.statut = 'active'
      and (s.superviseur_id is null or s.superviseur_id = p_profile_id);
  else
    return;
  end if;

  update public.supervisor_invitations
  set status = 'activated', updated_at = now()
  where id = v_inv.id
    and status = 'pending';
end;
$$;

grant execute on function public.assign_supervisor_seance_from_invitation(uuid, text)
  to authenticated, anon;

-- Rattrapage : tous les superviseurs existants
do $$
declare
  r record;
begin
  for r in
    select distinct p.id as profile_id, public.profile_canonical_email(p.email, p.canonical_email) as mail
    from public.profiles p
    where private.profile_has_role(p.id, 'supervisor')
  loop
    if r.mail is not null and trim(r.mail) <> '' then
      perform public.assign_supervisor_seance_from_invitation(r.profile_id, r.mail);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
