-- Migration 0031 : policies INSERT/UPDATE sur presences pour le superviseur
-- Scope : membre avec inscription acceptée dans une séance dont le superviseur
-- connecté est responsable (même pattern que presences_select_superviseur de 0024).
-- Pas de vérification de fenêtre J+2 en RLS (garantie côté UI uniquement).
-- Note : exécutée manuellement le 2026-08-31, documentée a posteriori.

create policy presences_insert_superviseur
on presences
for insert
to authenticated
with check (
  exists (
    select 1
    from inscriptions i
    join seances s on s.id = i.seance_id
    where i.membre_id = presences.membre_id
    and presences.seance_id = i.seance_id
    and i.statut = 'accepte'::inscription_statut_enum
    and s.superviseur_id = auth.uid()
  )
);

create policy presences_update_superviseur
on presences
for update
to authenticated
using (
  exists (
    select 1
    from inscriptions i
    join seances s on s.id = i.seance_id
    where i.membre_id = presences.membre_id
    and presences.seance_id = i.seance_id
    and i.statut = 'accepte'::inscription_statut_enum
    and s.superviseur_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from inscriptions i
    join seances s on s.id = i.seance_id
    where i.membre_id = presences.membre_id
    and presences.seance_id = i.seance_id
    and i.statut = 'accepte'::inscription_statut_enum
    and s.superviseur_id = auth.uid()
  )
);
