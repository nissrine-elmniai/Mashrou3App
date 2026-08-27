-- Script COURT — New query seule, Run.
-- Remplit title / message / body à chaque envoi (schéma legacy).

alter table public.alerts add column if not exists title text;
alter table public.alerts add column if not exists message text;
alter table public.alerts add column if not exists body text;

update public.alerts
set
  message = coalesce(nullif(trim(message), ''), nullif(trim(body), ''), nullif(trim(title), ''), 'تنبيه'),
  body = coalesce(nullif(trim(body), ''), nullif(trim(message), ''), nullif(trim(title), ''), 'تنبيه'),
  title = left(coalesce(nullif(trim(title), ''), nullif(trim(message), ''), nullif(trim(body), ''), 'تنبيه'), 120)
where coalesce(nullif(trim(title), ''), nullif(trim(message), ''), nullif(trim(body), '')) is not null
   or title is null or message is null or body is null;

create or replace function public.alerts_sync_legacy_columns()
returns trigger
language plpgsql
as $$
declare
  j jsonb := to_jsonb(NEW);
  v_msg text;
begin
  v_msg := coalesce(
    nullif(trim(j->>'message'), ''),
    nullif(trim(j->>'body'), ''),
    nullif(trim(j->>'content'), ''),
    nullif(trim(j->>'contenu'), ''),
    nullif(trim(j->>'text'), ''),
    nullif(trim(j->>'title'), ''),
    'تنبيه من الإدارة'
  );

  if j ? 'message' then
    j := jsonb_set(j, '{message}', to_jsonb(v_msg));
  end if;
  if j ? 'body' then
    j := jsonb_set(j, '{body}', to_jsonb(v_msg));
  end if;
  if j ? 'content' then
    j := jsonb_set(j, '{content}', to_jsonb(v_msg));
  end if;
  if j ? 'contenu' then
    j := jsonb_set(j, '{contenu}', to_jsonb(v_msg));
  end if;
  if j ? 'text' then
    j := jsonb_set(j, '{text}', to_jsonb(v_msg));
  end if;
  if j ? 'title' then
    j := jsonb_set(j, '{title}', to_jsonb(left(v_msg, 120)));
  end if;
  if j ? 'audience' and coalesce(nullif(trim(j->>'audience'), ''), '') = '' then
    j := jsonb_set(j, '{audience}', to_jsonb('all'::text));
  end if;

  NEW := jsonb_populate_record(NEW, j);
  return NEW;
end;
$$;

drop trigger if exists alerts_sync_legacy_columns on public.alerts;
create trigger alerts_sync_legacy_columns
  before insert or update on public.alerts
  for each row
  execute procedure public.alerts_sync_legacy_columns();

create or replace function public.send_alert(p_message text, p_audience text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_msg text := trim(p_message);
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

  insert into public.alerts (id, title, message, body, audience, created_by, created_at)
  values (
    gen_random_uuid()::text,
    left(v_msg, 120),
    v_msg,
    v_msg,
    p_audience,
    v_admin_id,
    now()
  );
end;
$$;

grant execute on function public.send_alert(text, text) to authenticated;
notify pgrst, 'reload schema';
select 'ok' as status;
