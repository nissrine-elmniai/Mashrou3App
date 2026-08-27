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
 * L'identité des membres est portée par la table profiles (source unique) :
 * on joint inscriptions -> profiles via la FK membre_id -> profiles.id.
 * (Plus aucune requête vers des tables membres/users inexistantes.)
 *
 * dateNaissance / genre restent à null : profiles ne porte pas de colonnes
 * équivalentes (dette technique documentée — hors périmètre de cette tâche).
 */
export async function getSeanceMembers(seanceId) {
  const { data, error } = await supabase
    .from("inscriptions")
    .select("membre_id, statut, profiles(*)")
    .eq("seance_id", seanceId)
    .eq("statut", "accepte");

  const [{ data: membres, error: membresError }, { data: users, error: usersError }] =
    await Promise.all([
      supabase.from("membres").select("*").in("user_id", membreIds),
      supabase.from("users").select("*").in("id", membreIds),
    ]);
  if (membresError) throw membresError;
  if (usersError) throw usersError;

  const membresById = new Map((membres || []).map((m) => [m.user_id, m]));
  const usersById = new Map((users || []).map((u) => [u.id, u]));
  const inscriptionsByMembreId = new Map(
    (inscriptions || []).map((i) => [i.membre_id, i])
  );

  return membreIds
    .filter((id) => usersById.has(id))
    .map((id) => {
      const u = usersById.get(id);
      const m = membresById.get(id);
      const i = inscriptionsByMembreId.get(id);
      return {
        userId: id,
        nom: u.nom,
        prenom: u.prenom,
        email: u.email,
        telephone: u.telephone,
        dateNaissance: m?.date_naissance,
        genre: m?.genre,
        statutInscription: i?.statut,
        dateInscription: i?.date_inscription,
  if (error) throw error;

  return (data || [])
    .map((row) => {
      const p = row.profiles;
      if (!p) return null;
      return {
        userId: p.id,
        nom: p.last_name,
        prenom: p.first_name,
        email: p.email,
        dateNaissance: null,
        genre: null,
      };
    })
    .filter(Boolean);
}
