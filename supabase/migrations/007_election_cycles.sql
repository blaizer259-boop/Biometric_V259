-- Add election cycles so historical reports are preserved instead of reset.
-- Existing candidates and votes are assigned to the first active election.

CREATE TABLE IF NOT EXISTS public.elections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    report_snapshot JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS elections_one_active_idx
    ON public.elections (status)
    WHERE status = 'active';

INSERT INTO public.elections (name, status)
SELECT concat(EXTRACT(YEAR FROM timezone('utc'::text, now()))::int, ' Election'), 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.elections);

ALTER TABLE public.candidates
    ADD COLUMN IF NOT EXISTS election_id UUID REFERENCES public.elections(id) ON DELETE RESTRICT;

ALTER TABLE public.votes
    ADD COLUMN IF NOT EXISTS election_id UUID REFERENCES public.elections(id) ON DELETE RESTRICT;

UPDATE public.candidates
SET election_id = (SELECT id FROM public.elections ORDER BY opened_at DESC LIMIT 1)
WHERE election_id IS NULL;

UPDATE public.votes
SET election_id = (SELECT id FROM public.elections ORDER BY opened_at DESC LIMIT 1)
WHERE election_id IS NULL;

ALTER TABLE public.candidates
    ALTER COLUMN election_id SET NOT NULL;

ALTER TABLE public.votes
    ALTER COLUMN election_id SET NOT NULL;

ALTER TABLE public.votes
    DROP CONSTRAINT IF EXISTS votes_voter_id_position_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'votes_voter_id_position_election_id_key'
          AND conrelid = 'public.votes'::regclass
    ) THEN
        ALTER TABLE public.votes
            ADD CONSTRAINT votes_voter_id_position_election_id_key UNIQUE (voter_id, position, election_id);
    END IF;
END $$;

REVOKE DELETE ON TABLE public.voters FROM anon;
REVOKE DELETE ON TABLE public.voters FROM authenticated;
REVOKE DELETE ON TABLE public.votes FROM anon;
REVOKE DELETE ON TABLE public.votes FROM authenticated;
REVOKE DELETE ON TABLE public.candidates FROM anon;
REVOKE DELETE ON TABLE public.candidates FROM authenticated;
REVOKE DELETE ON TABLE public.elections FROM anon;
REVOKE DELETE ON TABLE public.elections FROM authenticated;
