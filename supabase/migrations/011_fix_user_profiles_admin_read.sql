grant select on public.user_profiles to authenticated;

drop policy if exists "Admins can read all profiles" on public.user_profiles;
create policy "Admins can read all profiles"
  on public.user_profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() ->> 'role', '') = 'admin'
  );
