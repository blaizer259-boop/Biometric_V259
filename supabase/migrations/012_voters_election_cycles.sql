-- Tie voter registrations to election cycles.
-- Old voters are archived under the most recent closed election so a newly opened
-- active election starts with a clean registration list.

ALTER TABLE public.voters
    ADD COLUMN IF NOT EXISTS election_id UUID REFERENCES public.elections(id) ON DELETE RESTRICT;

UPDATE public.voters
SET election_id = COALESCE(
    (
        SELECT id
        FROM public.elections
        WHERE status = 'closed'
        ORDER BY closed_at DESC NULLS LAST, opened_at DESC
        LIMIT 1
    ),
    (
        SELECT id
        FROM public.elections
        ORDER BY opened_at DESC
        LIMIT 1
    )
)
WHERE election_id IS NULL;

ALTER TABLE public.voters
    ALTER COLUMN election_id SET NOT NULL;

ALTER TABLE public.voters
    DROP CONSTRAINT IF EXISTS voters_reg_number_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'voters_reg_number_election_id_key'
          AND conrelid = 'public.voters'::regclass
    ) THEN
        ALTER TABLE public.voters
            ADD CONSTRAINT voters_reg_number_election_id_key UNIQUE (reg_number, election_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS voters_election_id_idx
    ON public.voters (election_id);
