-- À coller dans Supabase → SQL Editor (une seule fois).
-- 1) Applique le correctif 0082 (rôle signup + RPC invitation).
-- 2) Enregistre 0025–0079 et 0081 comme déjà appliquées SANS ré-exécuter
--    leur SQL (le schéma live l'a déjà, et 0081 purgerait le chat).
-- 3) Enregistre 0082 après l'avoir exécutée.
--
-- Ne pas inclure 0080 ici : `npx supabase db push` pourra l'appliquer ensuite
-- (triggers d'archivage, pas de purge).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical text;
begin
  v_canonical := public.profile_canonical_email(
    new.email,
    new.raw_user_meta_data->>'canonical_email'
  );

  insert into public.profiles (
    id, email, canonical_email, role, roles, account_status, first_name, last_name
  )
  values (
    new.id,
    lower(new.email),
    v_canonical,
    'member',
    array['member']::text[],
    'active',
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do update set
    email = excluded.email,
    canonical_email = coalesce(excluded.canonical_email, public.profiles.canonical_email),
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    updated_at = now();
  return new;
end;
$$;

drop function if exists public.get_pending_supervisor_invitation(text);

create function public.get_pending_supervisor_invitation(p_email text)
returns table (
  id text,
  email text,
  status text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    i.id,
    i.email,
    i.status
  from public.supervisor_invitations i
  where lower(trim(i.email)) = lower(trim(p_email))
    and i.status = 'pending'
  order by i.created_at desc
  limit 1;
$$;

revoke all on function public.get_pending_supervisor_invitation(text) from public;
grant execute on function public.get_pending_supervisor_invitation(text) to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
select v.version, v.name, '{}'::text[]
from (
  values
    ('0025', '0025_profiles_fields_and_member_applications_rls'),
    ('0026', '0026_profile_multi_roles'),
    ('0027', '0027_fix_auto_affecter_min_uuid'),
    ('0028', '0028_fix_uuid_text_activation'),
    ('0029', '0029_drop_orphan_inscriptions_update_policy'),
    ('0030', '0030_drop_profiles_update_superviseur'),
    ('0031', '0031_fix_seances_updated_at'),
    ('0032', '0032_fix_supervisor_seance_link'),
    ('0033', '0033_seance_planning_history'),
    ('0034', '0034_presence_rappels_job'),
    ('0035', '0035_push_tokens'),
    ('0036', '0036_seances_saison_text_heure_optional'),
    ('0037', '0037_backfill_seances_saison_id'),
    ('0038', '0038_seances_timestamps'),
    ('0039', '0039_saisons_version'),
    ('0040', '0040_member_programs'),
    ('0041', '0041_progression_align_tumuns'),
    ('0042', '0042_saisons_dates_type_date'),
    ('0043', '0043_presences_fk_profiles'),
    ('0044', '0044_seances_fk_saisons'),
    ('0045', '0045_messages_drop_permissive_policies'),
    ('0046', '0046_messages_close_admin_member_pair'),
    ('0047', '0047_avatars_storage'),
    ('0048', '0048_member_applications_form_answers'),
    ('0049', '0049_member_applications_anon_insert'),
    ('0050', '0050_fix_auto_affecter_inscriptions_conflict'),
    ('0051', '0051_inscriptions_date_inscription'),
    ('0052', '0052_profiles_genre'),
    ('0053', '0053_inscriptions_saison_id_text'),
    ('0054', '0054_chat_groups'),
    ('0055', '0055_chat_group_avatars_storage'),
    ('0056', '0056_profiles_date_naissance'),
    ('0057', '0057_objectifs_alignement'),
    ('0058', '0058_objectifs_updated_at'),
    ('0059', '0059_objectifs_grants'),
    ('0060', '0060_member_applications_kind'),
    ('0061', '0061_member_applications_renewal_unique'),
    ('0062', '0062_objectifs_depart'),
    ('0063', '0063_inscriptions_saison_sync'),
    ('0064', '0064_chat_group_members_sync'),
    ('0065', '0065_notifications'),
    ('0066', '0066_alerts_saison_id'),
    ('0067', '0067_push_tokens_reassign'),
    ('0068', '0068_notifications_dispatch'),
    ('0069', '0069_notifications_push_cron'),
    ('0070', '0070_member_programs_type'),
    ('0071', '0071_presence_absence_notifications'),
    ('0072', '0072_presence_rappel_cron_15min'),
    ('0073', '0073_quiet_hours'),
    ('0074', '0074_quiet_hours_fixed'),
    ('0075', '0075_notification_copy'),
    ('0076', '0076_drop_legacy_cdc_tables'),
    ('0077', '0077_inscriptions_notifications'),
    ('0078', '0078_inscriptions_changement_seance'),
    ('0079', '0079_inscriptions_accord_genre'),
    ('0081', '0081_purge_saison_ephemeral'),
    ('0082', '0082_harden_signup_role_and_invite_lookup')
) as v(version, name)
on conflict (version) do nothing;

notify pgrst, 'reload schema';
