alter table public.voters
  add column if not exists face_descriptor jsonb;

comment on column public.voters.face_descriptor is
  'face-api.js descriptor stored as a JSON array of 128 numbers for voter authentication.';
