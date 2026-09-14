-- MIGRATION 0066 — alerts.saison_id + send_alert avec saison
-- Chaque alerte est rattachée à une saison ; le filtrage « après inscription »
-- (utilisateur + saison + date) reste côté API.

alter table public.alerts
  add column if not exists saison_id text;

create index if not exists alerts_saison_created_idx
  on public.alerts (saison_id, created_at desc);

create or replace function public.send_alert(
  p_message text,
  p_audience text,
  p_saison_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_msg text := trim(p_message);
  v_title text;
  v_saison text := nullif(trim(coalesce(p_saison_id, '')), '');
begin
  if not private.is_admin() then
    raise exception 'عملية مخصصة للإدارة فقط';
  end if;
  if v_msg is null or v_msg = '' then
    raise exception 'الرسالة فارغة';
  end if;
  if p_audience not in ('all', 'members', 'supervisors') then
    raise exception 'الجمهور المستهدف غير صالح';
  end if;

  v_title := left(v_msg, 120);

  insert into public.alerts (
    id, message, title, body, audience, created_by, saison_id
  ) values (
    gen_random_uuid()::text,
    v_msg,
    v_title,
    v_msg,
    p_audience,
    v_admin_id,
    v_saison
  );
end;
$$;

revoke all on function public.send_alert(text, text, text) from public;
grant execute on function public.send_alert(text, text, text) to authenticated;

-- Compat : anciens appels à 2 arguments (sans saison)
create or replace function public.send_alert(p_message text, p_audience text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_alert(p_message, p_audience, null::text);
end;
$$;

revoke all on function public.send_alert(text, text) from public;
grant execute on function public.send_alert(text, text) to authenticated;

notify pgrst, 'reload schema';
