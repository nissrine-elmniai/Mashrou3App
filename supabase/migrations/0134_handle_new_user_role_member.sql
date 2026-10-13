-- 0134_handle_new_user_role_member.sql
--
-- Faille : le handle_new_user installé en base lit le rôle dans
-- raw_user_meta_data, fourni par le client au signUp. 0082 corrigeait
-- ce point mais n'a jamais été appliquée en base (constat du 2026-10-13).
--
-- Seul handle_new_user est repris de 0082 (get_pending_supervisor_invitation
-- n'est pas recréée). Tout nouveau profil naît « member » et « active ».
-- Le rôle superviseur est posé ensuite par l'upsert service_role de
-- activate-invited-account (profiles_guard_role laisse passer service_role).
-- account_status et canonical_email ne sont plus lus dans les métadonnées.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles as p (
    id, email, canonical_email, role, roles, account_status, first_name, last_name
  )
  values (
    new.id,
    lower(new.email),
    public.profile_canonical_email(new.email, null),
    'member',
    array['member']::text[],
    'active',
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do update set
    email      = excluded.email,
    first_name = coalesce(excluded.first_name, p.first_name),
    last_name  = coalesce(excluded.last_name, p.last_name),
    updated_at = now();
  -- role, roles, account_status, canonical_email : jamais modifiés ici
  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- Test à blanc (à lancer à part, APRÈS la migration ; tout est annulé)
-- Attendu : member | {member} | active | test-0134@example.com | Test
-- ============================================================
-- do $$
-- declare
--   v_id uuid := gen_random_uuid();
--   r    record;
-- begin
--   insert into auth.users (id, email, aud, role, raw_user_meta_data, raw_app_meta_data)
--   values (v_id, 'test-0134@example.com', 'authenticated', 'authenticated',
--           '{"role":"admin","account_status":"inactive","first_name":"Test"}'::jsonb,
--           '{}'::jsonb);
--   select role, roles, account_status, canonical_email, first_name
--     into r
--   from public.profiles where id = v_id;
--   raise exception 'ROLE : % | ROLES : % | STATUT : % | CANONIQUE : % | PRÉNOM : %',
--     r.role, r.roles, r.account_status, r.canonical_email, r.first_name;
-- end $$;

-- ============================================================
-- Vérifications post-exécution (true attendu pour les deux)
-- ============================================================
-- select position('raw_user_meta_data->>''role'''
--        in pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 0
--        as role_meta_ignore;
--
-- select to_regprocedure('public.get_pending_supervisor_invitation(text)') is not null
--        as fonction_invitation_presente;
--
-- Puis, dans l'app : activer un superviseur et un membre de test
-- (code à 6 chiffres) → role = supervisor / member dans profiles.
