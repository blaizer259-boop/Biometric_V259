-- Admin-only candidate removal for the active election.
-- Candidates with votes or candidates from closed elections cannot be removed.

CREATE OR REPLACE FUNCTION public.remove_active_candidate(p_candidate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    candidate_record public.candidates%ROWTYPE;
    linked_election_status TEXT;
    candidate_vote_count INTEGER;
BEGIN
    IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' THEN
        RAISE EXCEPTION 'Only admin users can remove candidates.';
    END IF;

    SELECT *
    INTO candidate_record
    FROM public.candidates
    WHERE id = p_candidate_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Candidate not found.';
    END IF;

    SELECT status
    INTO linked_election_status
    FROM public.elections
    WHERE id = candidate_record.election_id;

    IF linked_election_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Candidates from closed elections cannot be removed.';
    END IF;

    SELECT COUNT(*)
    INTO candidate_vote_count
    FROM public.votes
    WHERE candidate_id = p_candidate_id;

    IF candidate_vote_count > 0 THEN
        RAISE EXCEPTION 'This candidate already has votes and cannot be removed.';
    END IF;

    DELETE FROM public.candidates
    WHERE id = p_candidate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_active_candidate(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_active_candidate(UUID) TO authenticated;
