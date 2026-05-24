-- MMU E-Voting System: Create all required tables
-- Run this in the Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/klgkwzdedomqcfbkykmb/sql/new

-- 1. Voters Table
CREATE TABLE IF NOT EXISTS public.voters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    reg_number TEXT UNIQUE NOT NULL,
    email TEXT,
    phone TEXT,
    face_hash TEXT,
    face_descriptor JSONB,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    has_voted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.voters
    ADD COLUMN IF NOT EXISTS face_descriptor JSONB;

ALTER TABLE public.voters
    ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS voters_auth_user_id_idx
    ON public.voters (auth_user_id);

-- 2. Candidates Table
CREATE TABLE IF NOT EXISTS public.candidates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    motto TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Votes Table (with unique constraint to prevent double voting per position)
CREATE TABLE IF NOT EXISTS public.votes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    voter_id UUID REFERENCES public.voters(id) ON DELETE CASCADE NOT NULL,
    candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
    position TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(voter_id, position)
);

-- 4. Enable Realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.voters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.candidates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;

-- 5. Disable Row Level Security for development (so frontend can read/write freely)
ALTER TABLE public.voters DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes DISABLE ROW LEVEL SECURITY;
