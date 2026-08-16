-- À exécuter dans Supabase → SQL Editor
-- MIGRATION 0014 — alerts + alert_acknowledgments (alertes bloquantes RG9)
-- À exécuter après supabase/migrations/0013_supervisor_invitations.sql
--
-- BUT : remplacer les mock de AdminNotificationsScreen par un vrai canal
-- d'alertes. L'admin émet une alerte (message + audience : tout le monde /
-- membres / superviseurs) via le RPC public.send_alert (security definer,
-- réservé aux admins). Chaque destinataire voit l'alerte au prochain connect ;
-- la passerelle bloquante (BlockingAlertGate, requête périodique 30 s +
-- retour au premier plan) l'affiche en modale jusqu'à l'acquittement.
--
-- Modèle d'acquittement : une ligne par (alerte, utilisateur) créée au moment
-- de l'acquittement (insert sur alert_acknowledgments, RLS : ack de SA propre
-- ligne uniquement et uniquement si l'audience de l'alerte le concerne).
-- La PK composite (alert_id, member_id) rend l'acquittement idempotent
-- (23505 intercepté côté JS).
--
-- Sécurité : comme dans 0009, AUCUNE policy de ce fichier ne contient de
-- sous-requête inline vers une table protégée par RLS. Les vérifications de
-- rôle / audience passent par les fonctions security definer du schéma
-- private (private.alert_targets_me, private.can_acknowledge_alert) : leurs
-- requêtes internes s'exécutent avec les droits du propriétaire, donc sans
-- ré-évaluation RLS en cascade, et elles ne renvoient qu'un booléen — jamais
-- de données d'un autre utilisateur.

create table if not exists public.alerts (
  id text primary key,
  message text not null
    check (char_length(message) between 1 and 500),
  audience text not null
    check (audience in ('all', 'members', 'supervisors')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists alerts_created_at_idx
  on public.alerts (created_at desc);

create index if not exists alerts_audience_idx
  on public.alerts (audience);

create table if not exists public.alert_acknowledgments (
  alert_id text references public.alerts (id) on delete cascade,
  member_id uuid references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (alert_id, member_id)
);

alter table public.alerts enable row level security;
alter table public.alert_acknowledgments enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on table public.alerts to authenticated;
grant select, insert on table public.alert_acknowledgments to authenticated;

-- ===========================================================================
-- FONCTIONS HELPER security definer (même contrat que 0009)
-- ---------------------------------------------------------------------------
-- private.alert_targets_me(p_audience text) — auth.uid() est-il destinataire
-- de l'audience p_audience ? Ne lit QUE le rôle de auth.uid() dans profiles
-- (jamais alerts). Remplace les sous-requêtes inline vers profiles des
-- policies alerts_select_recipients et alert_acknowledgments_insert_own.
-- ---------------------------------------------------------------------------
create or replace function private.alert_targets_me(p_audience text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if p_audience = 'all' then
    return true;
  end if;
  select role into v_role
  from public.profiles
  where id = auth.uid();
  return (v_role = 'member' and p_audience = 'members')
      or (v_role = 'supervisor' and p_audience = 'supervisors');
end;
$$;

-- ---------------------------------------------------------------------------
-- private.can_acknowledge_alert(p_alert_id text) — l'alerte p_alert_id
-- existe-t-elle ET son audience concerne-t-elle auth.uid() ? Lit alerts en
-- interne (l'audience de la ligne concernée uniquement) et délègue la
-- vérification de rôle à private.alert_targets_me. Remplace la sous-requête
-- inline vers alerts (elle-même à double sous-requête vers profiles) de la
-- policy alert_acknowledgments_insert_own.
-- ---------------------------------------------------------------------------
create or replace function private.can_acknowledge_alert(p_alert_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_alert_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.alerts a
    where a.id = p_alert_id
      and private.alert_targets_me(a.audience)
  );
end;
$$;

grant execute on function private.alert_targets_me(text) to authenticated;
grant execute on function private.can_acknowledge_alert(text) to authenticated;

-- RLS alerts : l'admin voit/gère tout ; les autres ne LISENT que les alertes
-- dont l'audience couvre leur propre rôle (aucune écriture : l'insertion
-- passe exclusivement par le RPC send_alert, réservé aux admins).
drop policy if exists "alerts_admin_all" on public.alerts;
create policy "alerts_admin_all"
  on public.alerts
  for all
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "alerts_select_recipients" on public.alerts;
create policy "alerts_select_recipients"
  on public.alerts
  for select
  using (private.alert_targets_me(audience));

-- RLS alert_acknowledgments : l'admin voit tous les acquittements ; chaque
-- utilisateur ne voit que les siens et n'insère que son propre acquittement,
-- et uniquement pour une alerte dont l'audience le concerne.
drop policy if exists "alert_acknowledgments_admin_all" on public.alert_acknowledgments;
create policy "alert_acknowledgments_admin_all"
  on public.alert_acknowledgments
  for all
  using (private.is_admin())
  with check (private.is_admin());

drop policy if exists "alert_acknowledgments_select_own" on public.alert_acknowledgments;
create policy "alert_acknowledgments_select_own"
  on public.alert_acknowledgments
  for select
  using (member_id = auth.uid());

drop policy if exists "alert_acknowledgments_insert_own" on public.alert_acknowledgments;
create policy "alert_acknowledgments_insert_own"
  on public.alert_acknowledgments
  for insert
  with check (
    member_id = auth.uid()
    and private.can_acknowledge_alert(alert_id)
  );

-- RPC d'émission : réservé aux admins (contrôle identique à celui des
-- autres RPC sécurité : private.is_admin(), security definer).
-- L'id est généré côté serveur (gen_random_uuid, extension pgcrypto activée
-- par défaut sur Supabase).
create or replace function public.send_alert(p_message text, p_audience text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
begin
  if not private.is_admin() then
    raise exception 'عملية مخصصة للإدارة فقط';
  end if;
  if p_message is null or trim(p_message) = '' then
    raise exception 'الرسالة فارغة';
  end if;
  if p_audience not in ('all', 'members', 'supervisors') then
    raise exception 'الجمهور المستهدف غير صالح';
  end if;

  select auth.uid() into v_admin_id;

  insert into public.alerts (id, message, audience, created_by)
  values (gen_random_uuid()::text, trim(p_message), p_audience, v_admin_id);
end;
$$;

grant execute on function public.send_alert(text, text) to authenticated;

-- Rechargement du cache de schéma PostgREST.
notify pgrst, 'reload schema';

-- Vérifications (SQL Editor) :
--   select * from public.alerts order by created_at desc;
--   select a.message, count(ak.alert_id) as acquittements
--   from public.alerts a
--   left join public.alert_acknowledgments ak on ak.alert_id = a.id
--   group by a.id order by a.created_at desc;