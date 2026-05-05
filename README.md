# Vote Secure Realtime

Browser-based facial registration and login using face-api.js and Supabase.

Voters page:

```text
http://127.0.0.1:5173/Biometric.html
```

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

- Voter registration captures a real face descriptor and stores it with the voter record.
- Duplicate face registration is blocked by comparing the new scan with already-registered voter descriptors.
- Voter authentication compares the live webcam face with the registered descriptor before opening the ballot.
- Registration and login both sample three frames and require the face to be framed at roughly a 50cm webcam distance.

## Security Note

This demo performs the face match in the browser. For production authentication, move the final authorization decision to a trusted server or Supabase Edge Function and pair it with normal Supabase Auth.
