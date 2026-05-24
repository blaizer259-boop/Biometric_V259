-- Preserve election integrity by preventing client-side roles from deleting
-- registered voter records. The service role can still perform audited
-- maintenance directly from the backend when absolutely necessary.

REVOKE DELETE ON TABLE public.voters FROM anon;
REVOKE DELETE ON TABLE public.voters FROM authenticated;
