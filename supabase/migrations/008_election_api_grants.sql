-- Make the election lifecycle table available to the app API.
-- Deletes remain revoked by 007_election_cycles.sql.

GRANT SELECT, INSERT, UPDATE ON TABLE public.elections TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.elections TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.candidates TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.candidates TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.votes TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.votes TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.voters TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.voters TO authenticated;

REVOKE DELETE ON TABLE public.voters FROM anon;
REVOKE DELETE ON TABLE public.voters FROM authenticated;
REVOKE DELETE ON TABLE public.votes FROM anon;
REVOKE DELETE ON TABLE public.votes FROM authenticated;
REVOKE DELETE ON TABLE public.candidates FROM anon;
REVOKE DELETE ON TABLE public.candidates FROM authenticated;
REVOKE DELETE ON TABLE public.elections FROM anon;
REVOKE DELETE ON TABLE public.elections FROM authenticated;
