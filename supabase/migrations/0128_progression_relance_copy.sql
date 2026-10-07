-- 0128_progression_relance_copy.sql
-- Nouveau libellé du rappel de progression (membre).
-- La logique (paliers 7 / 14 / 21 jours, une notif par palier) est inchangée.
--
-- NE PAS exécuter automatiquement. À coller dans le SQL Editor.

create or replace function public.check_progression_relances()
returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_rec    record;
  v_jours  integer;
  v_palier integer;
  v_duree  text;
begin
  for v_rec in
    select i.membre_id,
           s.saison_id,
           max(p.date) as derniere_saisie
    from public.inscriptions i
    join public.seances s on s.id = i.seance_id
    left join public.progression p
           on p.membre_id = i.membre_id
          and (p.saison_id is null or p.saison_id = s.saison_id)
    where i.statut = 'accepte'::inscription_statut_enum
      and s.statut = 'active'::seance_statut_enum
    group by i.membre_id, s.saison_id
  loop
    if v_rec.derniere_saisie is null then
      continue;
    end if;

    v_jours  := floor(extract(epoch from (now() - v_rec.derniere_saisie)) / 86400)::int;
    v_palier := floor(v_jours / 7)::int;

    if v_palier < 1 or v_palier > 3 then
      continue;
    end if;

    -- 3–10 : « 7 أيام » ; 11 et plus : « 14 يومًا ».
    if v_jours between 3 and 10 then
      v_duree := v_jours::text || ' أيام';
    else
      v_duree := v_jours::text || ' يومًا';
    end if;

    begin
      insert into public.notifications (
        user_id, category, event_type, title, body,
        payload, source_table, source_id
      )
      values (
        v_rec.membre_id,
        'progression',
        'progression_relance',
        'كيف حال حفظك؟',
        format(
          'آخر تسجيل لتقدّمك كان منذ %s. نرجو منك تحديثه من خلال البرامج أو بتعديل موضع الحفظ، لنتمكّن من متابعة تقدّمك.',
          v_duree
        ),
        jsonb_build_object(
          'screen', 'MemberProgress',
          'params', jsonb_build_object(),
          'event_type', 'progression_relance'
        ),
        'progression',
        v_rec.membre_id::text || ':' || coalesce(v_rec.saison_id, '-')
          || ':relance:' || v_palier::text
      );
    exception
      when unique_violation then null;
      when others then
        raise notice 'check_progression_relances (%): %', v_rec.membre_id, SQLERRM;
    end;
  end loop;
end;
$$;

revoke all on function public.check_progression_relances() from public;
grant execute on function public.check_progression_relances() to postgres, service_role;

notify pgrst, 'reload schema';
