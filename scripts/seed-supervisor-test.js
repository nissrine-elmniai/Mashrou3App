require('dotenv').config({ path: './scripts/.env.seed' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findAuthUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function upsertUserRow(id, role, nom, prenom, email, telephone) {
  const { error } = await supabase
    .from('users')
    .upsert({ id, role, nom, prenom, email, telephone }, { onConflict: 'id' });
  if (error) throw error;
}

// La table `profiles` (utilisée par l'app pour router après login) exige un role
// anglais ('admin'|'supervisor'|'member' — cf. supabase/profiles.sql:7), différent
// du role français stocké dans la table `users` custom de l'app.
const PROFILE_ROLE = { superviseur: 'supervisor', membre: 'member' };

// Sans ça, le trigger handle_new_user() de Supabase met role='member' par défaut
// (auth.admin.createUser n'a pas de user_metadata.role) et tout le monde atterrit
// sur le dashboard membre au login, y compris le superviseur de test.
async function upsertProfileRow(id, role, nom, prenom, email) {
  const { error } = await supabase.from('profiles').upsert({
    id,
    email: email.toLowerCase(),
    role: PROFILE_ROLE[role] || role,
    account_status: 'active',
    first_name: prenom,
    last_name: nom,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw error;
}

// Idempotent : réutilise le compte auth existant (par email) au lieu de planter sur "already registered".
async function getOrCreateAuthUser(email, password, role, nom, prenom, telephone) {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    await upsertUserRow(existing.id, role, nom, prenom, email, telephone);
    await upsertProfileRow(existing.id, role, nom, prenom, email);
    return { id: existing.id, created: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role: PROFILE_ROLE[role] || role, first_name: prenom, last_name: nom },
  });
  if (error) {
    if (/already registered|already exists/i.test(error.message || '')) {
      const found = await findAuthUserByEmail(email);
      if (found) {
        await upsertUserRow(found.id, role, nom, prenom, email, telephone);
        await upsertProfileRow(found.id, role, nom, prenom, email);
        return { id: found.id, created: false };
      }
    }
    throw error;
  }

  const userId = data.user.id;
  await upsertUserRow(userId, role, nom, prenom, email, telephone);
  await upsertProfileRow(userId, role, nom, prenom, email);
  return { id: userId, created: true };
}

async function getOrCreateSaison() {
  const saisonId = 's_test_supervisor';
  const { data: existing, error: selErr } = await supabase
    .from('saisons')
    .select('*')
    .eq('id', saisonId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('saisons')
    .insert({
      id: saisonId,
      name: 'Saison Test',
      type: 'regular',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      registration_open: false,
      active: true,
      remote: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getOrCreateSeance(saisonId, supervisorId) {
  const { data: existing, error: selErr } = await supabase
    .from('seances').select('*')
    .eq('saison_id', saisonId).eq('superviseur_id', supervisorId).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  const { data, error } = await supabase.from('seances').insert({
    nom: 'Groupe Test', jour: 'lundi', heure_debut: '18:00', heure_fin: '19:00',
    saison_id: saisonId, superviseur_id: supervisorId, statut: 'active'
  }).select().single();
  if (error) throw error;
  return data;
}

async function ensureMembreRow(userId) {
  const { data: existing, error: selErr } = await supabase
    .from('membres').select('*').eq('user_id', userId).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return;

  const { error } = await supabase
    .from('membres')
    .insert({ user_id: userId, date_naissance: '2000-01-01', genre: 'M' });
  if (error) throw error;
}

async function ensureInscription(membreId, seanceId) {
  const { data: existing, error: selErr } = await supabase
    .from('inscriptions').select('*')
    .eq('membre_id', membreId).eq('seance_id', seanceId).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return;

  const { error } = await supabase.from('inscriptions').insert({
    membre_id: membreId, seance_id: seanceId, statut: 'accepte',
    date_inscription: new Date().toISOString()
  });
  if (error) throw error;
}

async function printSummary(seanceId, results) {
  const { data: rows, error } = await supabase
    .from('inscriptions')
    .select('statut, membre_id, membres(user_id, users(email))')
    .eq('seance_id', seanceId)
    .eq('statut', 'accepte');
  if (error) throw error;

  console.log('\n📋 Résumé — membres rattachés à la séance de test :');
  console.log(`   Total : ${rows.length} membre(s) avec statut 'accepte'`);
  rows.forEach((r) => {
    const email = r.membres?.users?.email || `(user_id=${r.membres?.user_id})`;
    const runInfo = results.find((x) => x.email === email);
    const tag = runInfo ? (runInfo.created ? '🆕 créé' : '⏭️  déjà présent') : '';
    console.log(`   - ${email} ${tag}`);
  });
}

(async () => {
  try {
    const supervisor = await getOrCreateAuthUser(
      'elaammarioumeima@gmail.com', 'Test1234!', 'superviseur', 'Elaammari', 'Oumeyma', '0600000000'
    );
    const { error: e1 } = await supabase
      .from('superviseurs')
      .upsert({ user_id: supervisor.id }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (e1) throw e1;

    const saison = await getOrCreateSaison();
    const seance = await getOrCreateSeance(saison.id, supervisor.id);

    const results = [];
    for (let i = 1; i <= 5; i++) {
      const email = `membre${i}.test@mashrou3.app`;
      const phone = `060000000${i}`;
      const member = await getOrCreateAuthUser(email, 'Test1234!', 'membre', `Membre${i}`, 'Test', phone);
      await ensureMembreRow(member.id);
      await ensureInscription(member.id, seance.id);
      results.push({ email, created: member.created });
    }

    console.log('✅ Seed terminé.');
    console.log('Login superviseur test: elaammarioumeima@gmail.com / Test1234!');
    results.forEach((r) => {
      console.log(`   ${r.created ? '🆕 créé' : '⏭️  déjà présent'} : ${r.email}`);
    });

    await printSummary(seance.id, results);
  } catch (err) {
    console.error('❌ Erreur pendant le seed :', err);
  }
})();
