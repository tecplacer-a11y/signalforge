import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle/migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Only needed for db-connected commands (migrate/push/studio).
    // `drizzle-kit generate` works offline.
    url: process.env.DATABASE_URL ?? "",
  },
});
