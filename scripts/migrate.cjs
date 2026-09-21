/* eslint-disable @typescript-eslint/no-require-imports -- plain Node ops script, not app code. */
/**
 * Applies supabase/migrations/001_init.sql to the Supabase Postgres database.
 * Run:  $env:SUPABASE_DB_PASSWORD='<db-password>'; node scripts/migrate.cjs
 * Never hardcode credentials here.
 */
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = process.env.SUPABASE_PROJECT_REF || "nsofzlooqddbnyxrsrrm";
  if (!password) {
    console.error("Missing SUPABASE_DB_PASSWORD env var.");
    process.exit(1);
  }
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = new Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      await client.query(sql);
      console.log("Applied:", f);
    }
    const tables = await client.query(
      `select table_name from information_schema.tables
       where table_schema='public' and table_name in ('datasets','checks','quarantine')
       order by table_name`,
    );
    console.log("Migration applied. Tables:", tables.rows.map((r) => r.table_name).join(", "));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
