-- Test à blanc 0138 — NE PAS exécuter avec la migration.
-- Toutes les écritures sont annulées : le bloc se termine TOUJOURS par une
-- exception qui contient les résultats.
--
-- Remplacer :
--   <uuid_membre>           — profil membre (cas 1–7 historiques)
--   <uuid_admin>            — admin (réservé / JWT alternatif si besoin)
--   <uuid_membre_inscrit>   — membre « accepte », position actuelle < 480
--   <id_objectif>           — id d'un objectif existant (saison active)
-- Prérequis : saison active, migration 0138 appliquée.

do $test$
declare
  v_membre uuid := '<uuid_membre>'::uuid;
  v_admin uuid := '<uuid_admin>'::uuid;
  v_inscrit uuid := '<uuid_membre_inscrit>'::uuid;
  v_objectif_id text := '<id_objectif>';
  v_saison text;
  v_prog_id text;
  v_out text := '';
  v_d integer;
  v_max integer;
begin
  select z.id into v_saison from public.saisons z where z.active limit 1;
  if v_saison is null then
    raise exception 'TEST: aucune saison active';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_membre, 'role', 'authenticated')::text,
    false
  );

  -- Position connue pour les cas objectif (sinon 0137 bloque avant 0138).
  delete from public.objectifs where membre_id = v_membre and saison_id = v_saison;
  delete from public.progression where membre_id = v_membre;
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_membre, v_saison, now(), 50, 0);

  v_d := private.season_start_tumun(v_membre, v_saison);
  v_max := (480 - v_d) / 8;
  if v_max < 1 then
    raise exception 'TEST: membre de test déjà trop avancé (D=%, max=%)', v_d, v_max;
  end if;

  -- 1. INSERT objectif > N → T5 (message sans « s » collé au nombre)
  begin
    insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
    values (v_membre, v_saison, v_max + 1);
    v_out := v_out || E'\n1 INSERT > N : ACCEPTE (anomalie)';
  exception when others then
    v_out := v_out || E'\n1 INSERT > N : refuse (' || sqlerrm || ')';
    if position(('الحد الأقصى: ' || v_max::text) in sqlerrm) > 0
       and position(('الحد الأقصى: ' || v_max::text || 's') in sqlerrm) = 0 then
      v_out := v_out || ' [T5 nombre OK]';
    else
      v_out := v_out || ' [T5 nombre ANOMALIE]';
    end if;
  end;

  -- 2. INSERT objectif = N → OK
  begin
    insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
    values (v_membre, v_saison, v_max);
    v_out := v_out || E'\n2 INSERT = N : accepte';
  exception when others then
    v_out := v_out || E'\n2 INSERT = N : REFUSE (' || sqlerrm || ')';
  end;

  -- 3. UPDATE sans changement de cible → OK
  begin
    update public.objectifs
    set nb_hizb_cible = v_max, updated_at = now()
    where membre_id = v_membre and saison_id = v_saison;
    v_out := v_out || E'\n3 UPDATE même cible : accepte';
  exception when others then
    v_out := v_out || E'\n3 UPDATE même cible : REFUSE (' || sqlerrm || ')';
  end;

  -- 4. Objectif pour D = 480 → T3
  delete from public.objectifs where membre_id = v_membre and saison_id = v_saison;
  delete from public.progression where membre_id = v_membre;
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_membre, v_saison, now(), 60, 0);
  begin
    insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
    values (v_membre, v_saison, 1);
    v_out := v_out || E'\n4 D=480 objectif : ACCEPTE (anomalie)';
  exception when others then
    v_out := v_out || E'\n4 D=480 objectif : refuse (' || sqlerrm || ')';
  end;

  -- 5. Programme hifz pour خاتم → T6
  v_prog_id := 'mp_test_0138_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  begin
    insert into public.member_programs (
      id, membre_id, saison_id, title, nb_hizb, duration_days,
      start_date, completed_tumuns, type
    ) values (
      v_prog_id, v_membre, v_saison, 'test hifz khatm', 1, 30,
      current_date, 0, 'hifz'
    );
    v_out := v_out || E'\n5 hifz خاتم : ACCEPTE (anomalie)';
  exception when others then
    v_out := v_out || E'\n5 hifz خاتم : refuse (' || sqlerrm || ')';
  end;

  -- 6. Programme mouraja3a pour خاتم → OK
  v_prog_id := 'mp_test_0138_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  begin
    insert into public.member_programs (
      id, membre_id, saison_id, title, nb_hizb, duration_days,
      start_date, completed_tumuns, type
    ) values (
      v_prog_id, v_membre, v_saison, 'test mouraja3a khatm', 1, 30,
      current_date, 0, 'mouraja3a'
    );
    v_out := v_out || E'\n6 mouraja3a خاتم : accepte';
  exception when others then
    v_out := v_out || E'\n6 mouraja3a خاتم : REFUSE (' || sqlerrm || ')';
  end;

  -- 7. UPDATE d'un hifz existant sans changer type → OK
  delete from public.member_programs where id like 'mp_test_0138_%';
  delete from public.progression where membre_id = v_membre;
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_membre, v_saison, now(), 10, 0);
  v_prog_id := 'mp_test_0138_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into public.member_programs (
    id, membre_id, saison_id, title, nb_hizb, duration_days,
    start_date, completed_tumuns, type
  ) values (
    v_prog_id, v_membre, v_saison, 'hifz existant', 2, 30,
    current_date, 0, 'hifz'
  );
  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_membre, v_saison, now() + interval '1 second', 60, 0);
  begin
    update public.member_programs
    set title = 'hifz existant maj', updated_at = now()
    where id = v_prog_id;
    v_out := v_out || E'\n7 UPDATE hifz existant (type inchangé) : accepte';
  exception when others then
    v_out := v_out || E'\n7 UPDATE hifz existant : REFUSE (' || sqlerrm || ')';
  end;

  -- 8. Upsert ± ثمن d'un hifz existant après passage خاتم → OK ;
  --    nouveau hifz → T6 ; mouraja3a → OK
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_inscrit, 'role', 'authenticated')::text,
    false
  );
  if not exists (
    select 1 from public.inscriptions i
    where i.membre_id = v_inscrit
      and i.saison_id = v_saison
      and i.statut::text = 'accepte'
  ) then
    raise exception 'TEST: <uuid_membre_inscrit> sans inscription accepte';
  end if;

  delete from public.member_programs
  where membre_id = v_inscrit and id like 'mp_test_0138_%';
  delete from public.progression where membre_id = v_inscrit;

  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_inscrit, v_saison, now(), 10, 0);

  v_prog_id := 'mp_test_0138_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into public.member_programs (
    id, membre_id, saison_id, title, nb_hizb, duration_days,
    start_date, completed_tumuns, type
  ) values (
    v_prog_id, v_inscrit, v_saison, 'hifz avant khatm', 2, 30,
    current_date, 0, 'hifz'
  );

  insert into public.progression (
    membre_id, saison_id, date, nb_hizb_completes, tumun_courant
  ) values (v_inscrit, v_saison, now() + interval '1 second', 60, 0);

  begin
    insert into public.member_programs (
      id, membre_id, saison_id, title, nb_hizb, duration_days,
      start_date, completed_tumuns, type
    ) values (
      v_prog_id, v_inscrit, v_saison, 'hifz avant khatm', 2, 30,
      current_date, 1, 'hifz'
    )
    on conflict (id) do update
      set completed_tumuns = excluded.completed_tumuns,
          updated_at = now();
    v_out := v_out || E'\n8a upsert hifz existant (± ثمن) après خاتم : accepte';
  exception when others then
    v_out := v_out || E'\n8a upsert hifz existant : REFUSE (' || sqlerrm || ')';
  end;

  begin
    insert into public.member_programs (
      id, membre_id, saison_id, title, nb_hizb, duration_days,
      start_date, completed_tumuns, type
    ) values (
      'mp_test_0138_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      v_inscrit, v_saison, 'nouveau hifz khatm', 1, 30,
      current_date, 0, 'hifz'
    );
    v_out := v_out || E'\n8b nouveau hifz خاتم : ACCEPTE (anomalie)';
  exception when others then
    v_out := v_out || E'\n8b nouveau hifz خاتم : refuse (' || sqlerrm || ')';
  end;

  begin
    insert into public.member_programs (
      id, membre_id, saison_id, title, nb_hizb, duration_days,
      start_date, completed_tumuns, type
    ) values (
      'mp_test_0138_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      v_inscrit, v_saison, 'mouraja3a apres khatm', 1, 30,
      current_date, 0, 'mouraja3a'
    );
    v_out := v_out || E'\n8c mouraja3a خاتم : accepte';
  exception when others then
    v_out := v_out || E'\n8c mouraja3a خاتم : REFUSE (' || sqlerrm || ')';
  end;

  -- 9. Objectif ré-enregistré à l'identique par upsert → OK
  begin
    if not exists (select 1 from public.objectifs o where o.id = v_objectif_id) then
      raise exception 'objectif % introuvable', v_objectif_id;
    end if;
    insert into public.objectifs (membre_id, saison_id, nb_hizb_cible)
    select o.membre_id, o.saison_id, o.nb_hizb_cible
    from public.objectifs o
    where o.id = v_objectif_id
    on conflict (membre_id, saison_id) do update
      set nb_hizb_cible = excluded.nb_hizb_cible;
    v_out := v_out || E'\n9 upsert objectif même cible : accepte';
  exception when others then
    v_out := v_out || E'\n9 upsert objectif même cible : REFUSE (' || sqlerrm || ')';
  end;

  raise exception 'TEST 0138 (annulé) :%', v_out;
end;
$test$;
