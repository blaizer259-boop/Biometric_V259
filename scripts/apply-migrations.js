import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const migrationsDir = "supabase/migrations";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});

await client.connect();

try {
  const files = (await readdir(migrationsDir))
    .filter(file => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const path = join(migrationsDir, file);
    const sql = await readFile(path, "utf8");
    await client.query(sql);
    console.log(`Applied migration: ${path}`);
  }
} finally {
  await client.end();
}
