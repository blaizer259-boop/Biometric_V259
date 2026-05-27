# Vote Secure Realtime

Browser-based facial registration and login using face-api.js and Supabase.

Voters page:

```text
[http://127.0.0.1:5173/Biometric.html
](https://blaizer259-boop.github.io/Biometric_V259/Biometric.html)```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example` and fill in your Supabase project values:

   ```bash
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-publishable-key
   ```

3. The required face-api.js model files are served from `public/models`.

   Required groups:

   - `tiny_face_detector_model-*`
   - `face_landmark_68_model-*`
   - `face_recognition_model-*`

4. Make sure the Supabase migrations in `supabase/migrations` are applied in filename order.

   If your machine can reach the database host, apply them with:

   ```bash
   DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require" npm run db:migrate
   ```

   Some Supabase projects expose the direct database host over IPv6 only. If that connection fails, use the IPv4-compatible pooler connection string from Supabase Dashboard > Project Settings > Database > Connection pooling, or paste the SQL files from `supabase/migrations` into Supabase SQL Editor in filename order.

5. Run the app:

   ```bash
   npm run dev
   ```

## Flow

- Student accounts are created and signed in with Supabase Auth.
- Signed-in user profile names are stored in `public.user_profiles` and linked to the Supabase Auth user id.
- Voter registration captures a real face descriptor and stores it with the voter record.
- New voter records are linked to the signed-in Auth user when migration `005_auth_user_profiles.sql` has been applied.
- Admin access requires a Supabase Auth account with `app_metadata.role` set to `admin`.
- Duplicate face registration is blocked by comparing the new scan with already-registered voter descriptors.
- Voter authentication compares the live webcam face with the registered descriptor before opening the ballot.
- Registration and login both sample three frames and require the face to be framed at roughly a 50cm webcam distance.

## Security Note

Supabase Auth now handles account passwords and sessions. This demo still performs the face match in the browser. For production voting, move the final biometric authorization decision to a trusted server or Supabase Edge Function and enable strict Row Level Security policies for the voting tables.

To make an admin account, create the user in Supabase Auth and set the user's app metadata to:

```json
{
  "role": "admin"
}
```

Or create/reset it from this project with:

```bash
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" ADMIN_EMAIL="admin@university.edu" ADMIN_PASSWORD="your-strong-password" npm run auth:create-admin
```

To backfill Auth signups into `public.user_profiles`, run:

```bash
npm run auth:sync-profiles
```
