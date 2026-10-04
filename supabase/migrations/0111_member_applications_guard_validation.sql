-- 0111_member_applications_guard_validation.sql
-- Contrôles à l'INSERT d'une demande par anon / authenticated (non-admin).
-- Le trigger member_applications_guard n'est pas recréé.
--
-- R3 n'oppose plus l'email envoyé à celui du JWT : profiles.email peut
-- diverger de l'email Auth (profiles_update_own). Pour un season_renewal,
-- l'email de la ligne est remplacé par celui du JWT.
-- Le genre "" envoyé par un ancien client est ramené à NULL avant le CHECK
-- (seuls NULL, 'ذكر' et 'أنثى' sont acceptés).
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.
-- Un seul script = une transaction.

create or replace function private.member_applications_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_season_active boolean;
  v_season_open boolean;
  v_jwt_email text;
  v_seance_genre text;
  v_expected_genre text;
begin
  -- Hors requête API ou service_role : non concerné
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  -- Appel imbriqué (ex. link_member_application_on_profile à l'activation)
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if private.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- user_id : soi-même uniquement (null pour un invité sans compte)
    if new.user_id is distinct from auth.uid() then
      new.user_id := auth.uid();
    end if;
    new.activated_at := null;

    -- "" ou espaces → NULL, avant le CHECK et avant R5
    new.genre := nullif(trim(new.genre), '');

    -- R3 avant tout usage de l'email : le JWT fait foi pour un renouvellement
    if new.kind = 'season_renewal' then
      if auth.uid() is null then
        raise exception 'يجب تسجيل الدخول لتجديد التسجيل';
      end if;
      v_jwt_email := lower(coalesce(auth.jwt() ->> 'email', ''));
      if v_jwt_email = '' then
        raise exception 'يجب تسجيل الدخول لتجديد التسجيل';
      end if;
      new.email := v_jwt_email;
    end if;

    -- R1. Saison absente : ancien client, ou saisons non chargées
    if new.season_id is null or trim(new.season_id) = '' then
      raise exception 'يرجى تحديث التطبيق إلى آخر إصدار';
    end if;

    -- R2. Saison ouverte à l'inscription
    select z.active, z.registration_open
      into v_season_active, v_season_open
    from public.saisons z
    where z.id = new.season_id;

    if v_season_active is null
       or v_season_active = false
       or coalesce(v_season_open, false) = false then
      raise exception 'التسجيل غير مفتوح حالياً لهذا الموسم';
    end if;

    -- R4. Séance choisie : active et de cette saison
    if new.seance_id is not null then
      select s.genre
        into v_seance_genre
      from public.seances s
      where s.id = new.seance_id
        and s.statut = 'active'
        and s.saison_id = new.season_id;

      if not found then
        raise exception 'الحصة المختارة غير متاحة';
      end if;

      -- R5. Genre connu (demande, sinon profil) et compatible avec la séance
      v_expected_genre := new.genre;
      if v_expected_genre is null and auth.uid() is not null then
        select nullif(trim(p.genre), '')
          into v_expected_genre
        from public.profiles p
        where p.id = auth.uid();
      end if;

      if v_expected_genre is not null
         and v_expected_genre is distinct from v_seance_genre then
        raise exception 'الحصة المختارة لا تناسب الجنس المحدد';
      end if;
    end if;

    return new;
  end if;

  -- UPDATE : seule transition autorisée → activation de sa propre invitation
  if old.status = 'invited'
     and new.status = 'activated'
     and new.user_id = auth.uid() then
    new.season_id    := old.season_id;
    new.seance_id    := old.seance_id;
    new.kind         := old.kind;
    new.admin_note   := old.admin_note;
    new.accepted_at  := old.accepted_at;
    new.rejected_at  := old.rejected_at;
    return new;
  end if;

  -- Sinon : colonnes réservées à l'admin restaurées silencieusement
  new.status       := old.status;
  new.user_id      := old.user_id;
  new.season_id    := old.season_id;
  new.seance_id    := old.seance_id;
  new.kind         := old.kind;
  new.activated_at := old.activated_at;
  new.admin_note   := old.admin_note;
  new.accepted_at  := old.accepted_at;
  new.rejected_at  := old.rejected_at;
  return new;
end;
$function$;
