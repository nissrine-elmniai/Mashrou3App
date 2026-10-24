-- Test à blanc 0139 — NE PAS exécuter avec la migration.
-- Toutes les écritures sont annulées : exception finale qui contient les résultats.
--
-- Remplacer :
--   <uuid_membre_inscrit> — membre avec inscription 'accepte' (saison active)
-- Prérequis : saison active, migrations 0135–0139 appliquées.
--
-- T11 (cas c1) : le membre doit avoir un gain d'au moins 1 حزب dans la saison
-- (sinon min = 1 et le cas « cible < min » est sauté — CHECK SQL ≥ 1).

do $test$
declare
  v_inscrit uuid := '<uuid_membre_inscrit>'::uuid;
  v_saison text;
  v_saison_inactive text;
  v_out text := '';
  v_n integer;
  v_d integer;
  v_p integer;
  v_max integer;
  v_min integer;
  v_gain integer;
  v_id1 uuid;
  v_id2 uuid;
  v_id_hier uuid;
  v_id_other uuid;
  v_id_active_today uuid;
begin
  select z.id into v_saison from public.saisons z where z.active limit 1;
  if v_saison is null then
    raise exception 'TEST: aucune saison active';
  end if;

  select z.id into v_saison_inactive
  from public.saisons z
  where not z.active
  limit 1;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_inscrit, 'role', 'authenticated')::text,
    false
  );

  delete from public.objectifs where membre_id = v_inscrit and saison_id = v_saison;
  delete from public.progression where membre_id = v_inscrit;

  -- Position ancienne (hors « aujourd'hui ») pour ancrer D.
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (
    v_inscrit, v_saison, now() - interval '2 days', 10, 0
  );

  -- a. Deux inserts le même jour → une seule ligne restante (la dernière).
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_inscrit, v_saison, now(), 20, 0)
  returning id into v_id1;

  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_inscrit, v_saison, now() + interval '1 second', 30, 0)
  returning id into v_id2;

  select count(*) into v_n
  from public.progression p
  where p.membre_id = v_inscrit
    and p.saison_id is not distinct from v_saison
    and timezone('Africa/Casablanca', p.date)::date
      = timezone('Africa/Casablanca', now())::date;

  if v_n = 1 and exists (
    select 1 from public.progression where id = v_id2
  ) and not exists (
    select 1 from public.progression where id = v_id1
  ) then
    v_out := v_out || E'\na même jour : 1 ligne (dernière) OK';
  else
    v_out := v_out || E'\na même jour : ANOMALIE n=' || v_n::text;
  end if;

  -- a2. K1 : même jour, autre saison_id → la ligne de l'autre saison n'est PAS supprimée.
  if v_saison_inactive is null then
    v_out := v_out || E'\na2 autre saison : skip (aucune saison inactive)';
  else
    begin
      insert into public.progression (
        membre_id, saison_id, date, nb_hizb_completes, tumun_courant
      ) values (v_inscrit, v_saison, now() + interval '2 seconds', 31, 0)
      returning id into v_id_active_today;

      insert into public.progression (
        membre_id, saison_id, date, nb_hizb_completes, tumun_courant
      ) values (
        v_inscrit, v_saison_inactive, now() + interval '3 seconds', 5, 0
      )
      returning id into v_id_other;

      if exists (select 1 from public.progression where id = v_id_other)
         and exists (select 1 from public.progression where id = v_id_active_today)
      then
        v_out := v_out || E'\na2 autre saison même jour : conservée OK';
      else
        v_out := v_out || E'\na2 autre saison même jour : ANOMALIE (supprimée)';
      end if;
    exception when others then
      -- progression_require_active_enrollment peut bloquer selon la base.
      v_out := v_out
        || E'\na2 autre saison : skip (insert bloqué : '
        || sqlerrm || ')';
    end;
  end if;

  -- b. Insert hier + insert aujourd'hui → deux lignes (jours distincts).
  delete from public.progression where membre_id = v_inscrit;
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (
    v_inscrit, v_saison, now() - interval '1 day', 15, 0
  )
  returning id into v_id_hier;

  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_inscrit, v_saison, now(), 25, 0);

  select count(*) into v_n
  from public.progression where membre_id = v_inscrit;

  if v_n = 2 and exists (
    select 1 from public.progression where id = v_id_hier
  ) then
    v_out := v_out || E'\nb hier+aujourd''hui : 2 lignes OK';
  else
    v_out := v_out || E'\nb hier+aujourd''hui : ANOMALIE n=' || v_n::text;
  end if;

  -- Prépare D/P/G/min/max pour les cas objectif (P > D, gain ≥ 1 حزب pour T11).
  delete from public.objectifs where membre_id = v_inscrit and saison_id = v_saison;
  delete from public.progression where membre_id = v_inscrit;
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (
    v_inscrit, v_saison, now() - interval '3 days', 10, 0
  );
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_inscrit, v_saison, now(), 20, 0);

  v_d := private.season_start_tumun(v_inscrit, v_saison);
  select private.progression_tumun(p.nb_hizb_completes, p.tumun_courant)::integer
    into v_p
  from public.progression p
  where p.membre_id = v_inscrit
  order by p.date desc, p.id desc
  limit 1;
  v_gain := greatest(0, coalesce(v_p, v_d) - v_d);
  v_max := (480 - v_d) / 8;
  v_min := greatest(1, v_gain / 8 + 1);

  if v_min > v_max then
    raise exception 'TEST: min (%) > max (%) — choisir un autre membre', v_min, v_max;
  end if;

  -- c1. Objectif < min → T11
  -- Nécessite gain ≥ 1 حزب (sinon min = 1 et le cas est sauté).
  begin
    insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
    values (v_inscrit, v_saison, greatest(1, v_min - 1));
    if v_min <= 1 then
      delete from public.objectifs
      where membre_id = v_inscrit and saison_id = v_saison;
      v_out := v_out || E'\nc1 < min : skip (min=1 — gain < 1 حزب)';
    else
      v_out := v_out || E'\nc1 < min : ACCEPTE (anomalie)';
    end if;
  exception when others then
    v_out := v_out || E'\nc1 < min : refuse (' || sqlerrm || ')';
    if position(('الحد الأدنى: ' || v_min::text) in sqlerrm) > 0 then
      v_out := v_out || ' [T11 OK]';
    else
      v_out := v_out || ' [T11 ANOMALIE]';
    end if;
  end;

  -- c2. Objectif = min → OK
  delete from public.objectifs where membre_id = v_inscrit and saison_id = v_saison;
  begin
    insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
    values (v_inscrit, v_saison, v_min);
    v_out := v_out || E'\nc2 = min : accepte';
  exception when others then
    v_out := v_out || E'\nc2 = min : REFUSE (' || sqlerrm || ')';
  end;

  -- c3. N < 1 / min > N → T4 (une seule ligne haute : D = P, N = 0)
  delete from public.objectifs where membre_id = v_inscrit and saison_id = v_saison;
  delete from public.progression where membre_id = v_inscrit;
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_inscrit, v_saison, now(), 59, 4);
  begin
    insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
    values (v_inscrit, v_saison, 1);
    v_out := v_out || E'\nc3 min>N/N<1 : ACCEPTE (anomalie)';
  exception when others then
    v_out := v_out || E'\nc3 min>N/N<1 : refuse (' || sqlerrm || ')';
    if position('بقي أقل من حزب' in sqlerrm) > 0 then
      v_out := v_out || ' [T4 OK]';
    else
      v_out := v_out || ' [T4 ANOMALIE]';
    end if;
  end;

  -- c4. K2 : D < 480, P = 480 (60/0) → INSERT objectif → T3
  delete from public.objectifs where membre_id = v_inscrit and saison_id = v_saison;
  delete from public.progression where membre_id = v_inscrit;
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (
    v_inscrit, v_saison, now() - interval '4 days', 10, 0
  );
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_inscrit, v_saison, now(), 60, 0);
  begin
    insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
    values (v_inscrit, v_saison, 1);
    v_out := v_out || E'\nc4 K2 P=480 : ACCEPTE (anomalie)';
  exception when others then
    v_out := v_out || E'\nc4 K2 P=480 : refuse (' || sqlerrm || ')';
    if position('أتممت حفظ القرآن، لا يمكن تحديد هدف حفظ' in sqlerrm) > 0 then
      v_out := v_out || ' [T3 OK]';
    else
      v_out := v_out || ' [T3 ANOMALIE]';
    end if;
  end;

  -- d. Upsert identique d'un objectif déjà atteint → OK
  delete from public.objectifs where membre_id = v_inscrit and saison_id = v_saison;
  delete from public.progression where membre_id = v_inscrit;
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (
    v_inscrit, v_saison, now() - interval '5 days', 10, 0
  );
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (
    v_inscrit, v_saison, now() - interval '1 day', 12, 0
  );
  insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
  values (v_inscrit, v_saison, 1);
  -- Gain dépasse la cible
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_inscrit, v_saison, now(), 20, 0);
  begin
    update public.objectifs
    set nb_hizb_cible = 1, updated_at = now()
    where membre_id = v_inscrit and saison_id = v_saison;
    v_out := v_out || E'\nd upsert atteint : accepte';
  exception when others then
    v_out := v_out || E'\nd upsert atteint : REFUSE (' || sqlerrm || ')';
  end;

  raise exception 'TEST 0139 (rollback)%', v_out;
end;
$test$;
