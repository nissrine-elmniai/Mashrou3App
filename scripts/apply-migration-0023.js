/**
 * Applique 0023_fix_inscriptions_profiles_fk.sql sur la base distante.
 * Nécessite DATABASE_URL (connexion directe Postgres) dans scripts/.env.seed
 * ou variable d'environnement.
 *
 * Exemple DATABASE_URL :
 * postgres://postgres.[ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
 */
require("dotenv").config({ path: "./scripts/.env.seed" });
const fs = require("fs");
const path = require("path");

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error(
    "DATABASE_URL manquant — exécute le SQL de supabase/migrations/0023_fix_inscriptions_profiles_fk.sql dans le SQL Editor Supabase."
  );
  process.exit(1);
}

async function main() {
  const { Client } = require("pg");
  const sql = fs.readFileSync(
    path.join(__dirname, "../supabase/migrations/0023_fix_inscriptions_profiles_fk.sql"),
    "utf8"
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("✅ Migration 0023 appliquée.");
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
