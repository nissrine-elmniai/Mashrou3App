require('dotenv').config({ path: './scripts/.env.seed' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createAuthUser(email, password, role, nom, prenom) {
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;
  const { error: insertError } = await supabase
    .from('users')
    .insert({ id: userId, role, nom, prenom, email });
  if (insertError) throw insertError;
  return userId;
}

(async () => {
  try {
    const supervisorId = await createAuthUser(
      'elaammarioumeima@gmail.com', 'Test1234!', 'superviseur', 'Elaammari', 'Oumeyma'
    );
    const { error: e1 } = await supabase.from('superviseurs').insert({ user_id: supervisorId });
    if (e1) throw e1;

    const { data: saison, error: e2 } = await supabase.from('saisons').insert({
      nom: 'Saison Test', date_debut: '2026-01-01', date_fin: '2026-12-31', statut: 'active'
    }).select().single();
    if (e2) throw e2;

    const { data: seance, error: e3 } = await supabase.from('seances').insert({
      nom: 'Groupe Test', jour: 'lundi', heure_debut: '18:00', heure_fin: '19:00',
      saison_id: saison.id, superviseur_id: supervisorId, statut: 'active'
    }).select().single();
    if (e3) throw e3;

    for (let i = 1; i <= 3; i++) {
      const memberId = await createAuthUser(
        `membre${i}.test@mashrou3.app`, 'Test1234!', 'membre', `Membre${i}`, 'Test'
      );
      const { error: e4 } = await supabase
        .from('membres')
        .insert({ user_id: memberId, date_naissance: '2000-01-01', genre: 'M' });
      if (e4) throw e4;

      const { error: e5 } = await supabase.from('inscriptions').insert({
        membre_id: memberId, seance_id: seance.id, statut: 'accepte',
        date_inscription: new Date().toISOString()
      });
      if (e5) throw e5;
    }

    console.log('✅ Seed terminé.');
    console.log('Login superviseur test: elaammarioumeima@gmail.com / Test1234!');
  } catch (err) {
    console.error('❌ Erreur pendant le seed :', err);
  }
})();
