import { supabase } from "./supabase";

/** Séance active du superviseur (auth user id), ou null si aucune. */
export async function getSupervisorActiveSeance(supervisorAuthId) {
  const { data, error } = await supabase
    .from("seances")
    .select("*")
    .eq("superviseur_id", supervisorAuthId)
    .eq("statut", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Membres inscrits (statut='accepte') d'une séance, normalisés en
 * [{ userId, nom, prenom, email, dateNaissance, genre }].
 * Tente la jointure imbriquée PostgREST inscriptions -> membres -> users ;
 * si elle échoue, retombe sur 3 requêtes séparées plutôt que de deviner un
 * nom de contrainte FK.
 */
export async function getSeanceMembers(seanceId) {
  const nested = await supabase
    .from("inscriptions")
    .select("*, membres(*, users(*))")
    .eq("seance_id", seanceId)
    .eq("statut", "accepte");

  if (!nested.error) {
    return (nested.data || [])
      .filter((row) => row.membres?.users)
      .map((row) => ({
        userId: row.membres.users.id,
        nom: row.membres.users.nom,
        prenom: row.membres.users.prenom,
        email: row.membres.users.email,
        dateNaissance: row.membres.date_naissance,
        genre: row.membres.genre,
      }));
  }

  const { data: inscriptions, error: inscriptionsError } = await supabase
    .from("inscriptions")
    .select("*")
    .eq("seance_id", seanceId)
    .eq("statut", "accepte");
  if (inscriptionsError) throw inscriptionsError;

  const membreIds = (inscriptions || []).map((i) => i.membre_id);
  if (membreIds.length === 0) return [];

  const [{ data: membres, error: membresError }, { data: users, error: usersError }] =
    await Promise.all([
      supabase.from("membres").select("*").in("user_id", membreIds),
      supabase.from("users").select("*").in("id", membreIds),
    ]);
  if (membresError) throw membresError;
  if (usersError) throw usersError;

  const membresById = new Map((membres || []).map((m) => [m.user_id, m]));
  const usersById = new Map((users || []).map((u) => [u.id, u]));

  return membreIds
    .filter((id) => usersById.has(id))
    .map((id) => {
      const u = usersById.get(id);
      const m = membresById.get(id);
      return {
        userId: id,
        nom: u.nom,
        prenom: u.prenom,
        email: u.email,
        dateNaissance: m?.date_naissance,
        genre: m?.genre,
      };
    });
}
