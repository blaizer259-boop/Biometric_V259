import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loadDotEnv() {
  try {
    const envText = await readFile(".env", "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // The script can still run with environment variables supplied by the shell.
  }
}

await loadDotEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("VITE_SUPABASE_URL or SUPABASE_URL is required.");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

let page = 1;
let syncedCount = 0;

while (true) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 100,
  });

  if (error) throw error;
  if (!data.users.length) break;

  const profiles = data.users.map(user => ({
    id: user.id,
    email: user.email || "",
    first_name: user.user_metadata?.first_name || "",
    last_name: user.user_metadata?.last_name || "",
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from("user_profiles")
    .upsert(profiles, { onConflict: "id" });

  if (upsertError) throw upsertError;

  syncedCount += profiles.length;
  page += 1;
}

console.log(`Synced ${syncedCount} auth user profile(s).`);
