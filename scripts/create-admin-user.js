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
const adminEmail = process.env.ADMIN_EMAIL || "admin@university.edu";
const adminPassword = process.env.ADMIN_PASSWORD;

if (!supabaseUrl) {
  throw new Error("VITE_SUPABASE_URL or SUPABASE_URL is required.");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required. Use the service_role key from Supabase Project Settings > API.");
}

if (!adminPassword || adminPassword.length < 8) {
  throw new Error("ADMIN_PASSWORD is required and must be at least 8 characters.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
if (listError) throw listError;

const existingUser = usersData.users.find(
  user => user.email?.toLowerCase() === adminEmail.toLowerCase()
);

if (existingUser) {
  const { error } = await supabase.auth.admin.updateUserById(existingUser.id, {
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    app_metadata: {
      ...existingUser.app_metadata,
      role: "admin",
    },
  });

  if (error) throw error;
  console.log(`Updated admin user: ${adminEmail}`);
} else {
  const { error } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    app_metadata: {
      role: "admin",
    },
  });

  if (error) throw error;
  console.log(`Created admin user: ${adminEmail}`);
}
