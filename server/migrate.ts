import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Standalone migration runner. Applies any pending SQL migrations from
// drizzle/migrations/ and records them in the __drizzle_migrations table.
// Run before the server starts:
//   dev:  npm run db:migrate
//   prod: node dist/migrate.cjs && node dist/index.cjs (Dockerfile CMD)

// Same TLS logic as server/storage.ts: managed Postgres (RDS) needs SSL,
// local dev does not. Override with PGSSL=disable|require.
const dbUrl = process.env.DATABASE_URL || "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
const sslSetting =
  process.env.PGSSL === "disable" || (isLocal && process.env.PGSSL !== "require")
    ? false
    : { rejectUnauthorized: false };

async function main() {
  if (!dbUrl) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: dbUrl, ssl: sslSetting, max: 1 });
  const db = drizzle(pool);
  console.log("[migrate] applying pending migrations from drizzle/migrations ...");
  await migrate(db, { migrationsFolder: "drizzle/migrations" });
  console.log("[migrate] migrations up to date");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] migration failed:", err);
  process.exit(1);
});
