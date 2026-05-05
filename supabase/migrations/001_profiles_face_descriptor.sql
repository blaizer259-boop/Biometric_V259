create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  face_descriptor jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists face_descriptor jsonb;

create index if not exists profiles_face_descriptor_not_null_idx
  on public.profiles ((face_descriptor is not null));

create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

comment on column public.profiles.face_descriptor is
  'face-api.js descriptor stored as a JSON array of 128 numbers.';
