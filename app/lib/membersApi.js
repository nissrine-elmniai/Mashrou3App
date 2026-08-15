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
