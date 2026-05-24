import { readFile } from "node:fs/promises";
import { basename } from "node:path";

async function loadEnvFile(path = ".env") {
  const envText = await readFile(path, "utf8").catch(() => "");

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

await loadEnvFile();

const sqlFile = process.argv[2];
if (!sqlFile) {
  throw new Error("Usage: node scripts/run-sql-file.js <path-to-sql-file>");
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = new URL(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL).hostname.split(".")[0];

if (!accessToken) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required in .env.");
}

if (!projectRef) {
  throw new Error("VITE_SUPABASE_URL or SUPABASE_URL is required in .env.");
}

const query = await readFile(sqlFile, "utf8");
const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ query })
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Failed to run ${basename(sqlFile)}: HTTP ${response.status} ${body}`);
}

console.log(`Applied ${basename(sqlFile)} to Supabase project ${projectRef}.`);
