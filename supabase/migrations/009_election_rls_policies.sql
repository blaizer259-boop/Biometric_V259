-- RLS policies for election lifecycle controls.
-- Public users may read the lifecycle state and reports.
-- Only authenticated admin accounts may open or close elections.

ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read election lifecycle" ON public.elections;
CREATE POLICY "Anyone can read election lifecycle"
ON public.elections
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can open elections" ON public.elections;
CREATE POLICY "Admins can open elections"
ON public.elections
FOR INSERT
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can close elections" ON public.elections;
CREATE POLICY "Admins can close elections"
ON public.elections
FOR UPDATE
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
