-- 0133_sync_email_auth_profiles.sql
--
-- Cause : rien ne recopie auth.users.email dans profiles après la
-- confirmation d'un changement d'adresse (seul trigger sur auth.users :
-- on_auth_user_created, AFTER INSERT). L'écran admin lit profiles.email
-- et continue d'afficher l'ancienne adresse.
--
-- 1. Trigger AFTER UPDATE OF email sur auth.users → profiles.email et
--    canonical_email. Toute erreur est avalée (raise warning) : la
--    confirmation Auth ne doit jamais échouer.
-- 2. Réalignement ponctuel de canonical_email (1 ligne en base au
--    2026-10-13 : le compte admin, resté sur admin@mosque.ma).
--
-- Effets de bord vérifiés : on_profile_link_member_application et
-- on_profile_link_supervisor_invitation (UPDATE OF email) ne font rien
-- pour un profil admin, ni pour un membre ou un superviseur déjà en place.
-- Le réalignement ne modifie que canonical_email : ils ne se déclenchent pas.

begin;

create or replace function private.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or new.email is not distinct from old.email then
    return new;
  end if;

  begin
    update public.profiles
    set email           = lower(new.email),
        canonical_email = public.profile_canonical_email(new.email, null),
        updated_at      = now()
    where id = new.id
      and (email is distinct from lower(new.email)
           or canonical_email is distinct from
              public.profile_canonical_email(new.email, null));
  exception when others then
    -- Ne jamais faire échouer la confirmation Auth.
    -- L'écart reste détectable par la requête de contrôle F.
    raise warning 'sync_profile_email_from_auth % : %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function private.sync_profile_email_from_auth()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function private.sync_profile_email_from_auth();

-- Réalignement ponctuel (1 ligne attendue : le compte admin).
update public.profiles
set canonical_email = public.profile_canonical_email(email, null),
    updated_at      = now()
where canonical_email is distinct from public.profile_canonical_email(email, null);

commit;

-- ============================================================
-- Test à blanc (à lancer à part, APRÈS la migration ; tout est annulé)
-- Attendu : APRÈS et CANONIQUE = test-sync-0133@example.com
-- ============================================================
-- do $$
-- declare
--   v_id    uuid := '1cf8ba28-858e-45b5-bb9e-115739c1df94';
--   v_avant text;
--   v_apres text;
--   v_canon text;
-- begin
--   select email into v_avant from public.profiles where id = v_id;
--   update auth.users set email = 'test-sync-0133@example.com' where id = v_id;
--   select email, canonical_email into v_apres, v_canon
--   from public.profiles where id = v_id;
--   raise exception 'AVANT : % | APRÈS : % | CANONIQUE : %', v_avant, v_apres, v_canon;
-- end $$;

-- ============================================================
-- Vérifications post-exécution
-- ============================================================
-- A. 2 triggers attendus (on_auth_user_created, on_auth_user_email_updated)
-- select tgname, tgenabled, pg_get_triggerdef(oid) as def
-- from pg_trigger
-- where tgrelid = 'auth.users'::regclass and not tgisinternal;
--
-- F. 0 ligne attendue
-- select p.id, p.role, u.email as auth_email, p.email as profile_email
-- from auth.users u
-- join public.profiles p on p.id = u.id
-- where lower(u.email) is distinct from lower(p.email);
--
-- H. 0 ligne attendue
-- select p.id, p.role, p.email, p.canonical_email
-- from public.profiles p
-- where p.canonical_email is distinct from public.profile_canonical_email(p.email, null);
