create table if not exists public.concept_maps (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_title text not null check (char_length(source_title) between 1 and 200),
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists concept_maps_user_created_idx
  on public.concept_maps (user_id, created_at desc);

alter table public.concept_maps enable row level security;
revoke all on public.concept_maps from anon, authenticated;
grant all on public.concept_maps to service_role;
