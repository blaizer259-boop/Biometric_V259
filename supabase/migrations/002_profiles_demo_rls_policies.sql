alter table public.profiles enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to anon, authenticated;

drop policy if exists "Allow public face profile reads" on public.profiles;
create policy "Allow public face profile reads"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow public face profile registration" on public.profiles;
create policy "Allow public face profile registration"
  on public.profiles
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Allow public face profile updates" on public.profiles;
create policy "Allow public face profile updates"
  on public.profiles
  for update
  to anon, authenticated
  using (true)
  with check (true);
alter table public.profiles enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to anon, authenticated;

drop policy if exists "Allow public face profile reads" on public.profiles;
create policy "Allow public face profile reads"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow public face profile registration" on public.profiles;
create policy "Allow public face profile registration"
  on public.profiles
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Allow public face profile updates" on public.profiles;
create policy "Allow public face profile updates"
  on public.profiles
  for update
  to anon, authenticated 
  using (true)
  with check (true);
