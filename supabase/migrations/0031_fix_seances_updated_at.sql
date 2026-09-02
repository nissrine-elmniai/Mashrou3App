-- MIGRATION 0031 — correctif 0030 (updated_at + seance_id manquants)
-- À exécuter en une seule fois dans Supabase SQL Editor

alter table public.seances
  add column if not exists updated_at timestamptz default now();

alter table public.supervisor_invitations
  add column if not exists seance_id uuid references public.seances (id) on delete set null;

create index if not exists supervisor_invitations_seance_idx
  on public.supervisor_invitations (seance_id);

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
  v_group_name text;
  v_seance_id uuid;
begin
  if p_profile_id is null or p_canonical_email is null or trim(p_canonical_email) = '' then
    return;
  end if;

  select i.group_name, i.seance_id
  into v_group_name, v_seance_id
  from public.supervisor_invitations i
  where lower(trim(i.email)) = lower(trim(p_canonical_email))
    and i.status = 'activated'
  order by i.updated_at desc nulls last, i.created_at desc
  limit 1;

  if not found then
    return;
  end if;

  if v_seance_id is not null then
    update public.seances
    set superviseur_id = p_profile_id
    where id = v_seance_id
      and statut = 'active'
      and (superviseur_id is null or superviseur_id = p_profile_id);
    return;
  end if;

  if v_group_name is not null and trim(v_group_name) <> '' then
    update public.seances s
    set superviseur_id = p_profile_id
    where lower(trim(s.nom)) = lower(trim(v_group_name))
      and s.statut = 'active'
      and (s.superviseur_id is null or s.superviseur_id = p_profile_id);
  end if;
end;
$$;

grant execute on function public.assign_supervisor_seance_from_invitation(uuid, text)
  to authenticated, anon;

do $$
declare
  r record;
begin
  for r in
    select distinct p.id as profile_id, public.profile_canonical_email(p.email, p.canonical_email) as mail
    from public.profiles p
    where private.profile_has_role(p.id, 'supervisor')
  loop
    perform public.assign_supervisor_seance_from_invitation(r.profile_id, r.mail);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
