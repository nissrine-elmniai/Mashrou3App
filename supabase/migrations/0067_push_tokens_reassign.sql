-- 0067_push_tokens_reassign.sql
-- Un appareil (un expo_push_token) ne peut appartenir qu'à un compte.
-- L'upsert client sur le token échouait en RLS : UPDATE USING (user_id = auth.uid())
-- lit l'ANCIENNE ligne, donc le compte B ne peut pas réattribuer le token de A.
-- Solution : RPC SECURITY DEFINER upsert_push_token (auth.uid() obligatoire).
-- Les policies INSERT/UPDATE directes sont retirées ; SELECT + DELETE restent.

alter table public.push_tokens
  add column if not exists last_seen_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.push_tokens'::regclass
      and contype = 'u'
      and conname = 'push_tokens_expo_push_token_key'
  ) then
    alter table public.push_tokens
      add constraint push_tokens_expo_push_token_key unique (expo_push_token);
  end if;
exception
  when duplicate_object then null;
end $$;

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
drop policy if exists "push_tokens_update_own" on public.push_tokens;

revoke all on table public.push_tokens from public, anon;
revoke insert, update on table public.push_tokens from authenticated;
grant select, delete on table public.push_tokens to authenticated;
grant all on table public.push_tokens to postgres, service_role;

create or replace function public.upsert_push_token(
  p_token text,
  p_platform text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_platform text := lower(trim(p_platform));
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if p_token is null or trim(p_token) = '' then
    raise exception 'رمز الإشعارات مفقود';
  end if;
  if v_platform not in ('ios', 'android') then
    raise exception 'المنصة غير صالحة';
  end if;

  insert into public.push_tokens (
    user_id,
    expo_push_token,
    platform,
    last_seen_at,
    updated_at
  )
  values (
    v_uid,
    trim(p_token),
    v_platform,
    now(),
    now()
  )
  on conflict (expo_push_token) do update
  set
    user_id = excluded.user_id,
    platform = excluded.platform,
    last_seen_at = excluded.last_seen_at,
    updated_at = excluded.updated_at
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_push_token(text, text) from public;
grant execute on function public.upsert_push_token(text, text) to authenticated;

notify pgrst, 'reload schema';
