-- Fast, atomic ballot submission.
-- Keeps the UI responsive by replacing separate browser writes with one RPC call.

CREATE OR REPLACE FUNCTION public.cast_ballot(
  p_voter_id uuid,
  p_election_id uuid,
  p_votes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  election_record public.elections%rowtype;
  voter_record public.voters%rowtype;
  submitted_count integer;
  duplicate_count integer;
  vote_item jsonb;
  candidate_record record;
BEGIN
  IF p_voter_id IS NULL OR p_election_id IS NULL THEN
    RAISE EXCEPTION 'Voter and election are required.' USING ERRCODE = '22023';
  END IF;

  IF p_votes IS NULL OR jsonb_typeof(p_votes) <> 'array' OR jsonb_array_length(p_votes) = 0 THEN
    RAISE EXCEPTION 'At least one vote selection is required.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO election_record
  FROM public.elections
  WHERE id = p_election_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Election was not found.' USING ERRCODE = '22023';
  END IF;

  IF election_record.status <> 'active' THEN
    RAISE EXCEPTION 'This election is closed. Voting is no longer available.' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO voter_record
  FROM public.voters
  WHERE id = p_voter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voter was not found.' USING ERRCODE = '22023';
  END IF;

  IF voter_record.election_id IS DISTINCT FROM p_election_id THEN
    RAISE EXCEPTION 'This voter is not registered for the active election.' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)
  INTO duplicate_count
  FROM public.votes
  WHERE voter_id = p_voter_id
    AND election_id = p_election_id;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'This voter has already submitted a ballot for this election.' USING ERRCODE = '23505';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.ballot_positions (
    position text PRIMARY KEY
  ) ON COMMIT DROP;
  TRUNCATE TABLE pg_temp.ballot_positions;

  FOR vote_item IN SELECT * FROM jsonb_array_elements(p_votes)
  LOOP
    IF coalesce(vote_item ->> 'candidate_id', '') = '' OR coalesce(vote_item ->> 'position', '') = '' THEN
      RAISE EXCEPTION 'Each vote must include candidate_id and position.' USING ERRCODE = '22023';
    END IF;

    SELECT id, position
    INTO candidate_record
    FROM public.candidates
    WHERE id = (vote_item ->> 'candidate_id')::uuid
      AND election_id = p_election_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'One selected candidate is not available in this election.' USING ERRCODE = '23503';
    END IF;

    IF candidate_record.position <> vote_item ->> 'position' THEN
      RAISE EXCEPTION 'Candidate does not match the selected position.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO pg_temp.ballot_positions(position)
    VALUES (vote_item ->> 'position')
    ON CONFLICT (position) DO NOTHING;
  END LOOP;

  submitted_count := jsonb_array_length(p_votes);

  IF (SELECT COUNT(*) FROM pg_temp.ballot_positions) <> submitted_count THEN
    RAISE EXCEPTION 'Only one candidate can be selected per position.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.votes (voter_id, candidate_id, position, election_id)
  SELECT
    p_voter_id,
    (item ->> 'candidate_id')::uuid,
    item ->> 'position',
    p_election_id
  FROM jsonb_array_elements(p_votes) AS item;

  UPDATE public.voters
  SET has_voted = true
  WHERE id = p_voter_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Ballot submitted successfully.',
    'votes_recorded', submitted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_ballot(uuid, uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.cast_ballot(uuid, uuid, jsonb) TO authenticated;
