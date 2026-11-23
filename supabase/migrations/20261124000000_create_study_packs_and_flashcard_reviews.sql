create table if not exists public.flashcard_reviews (
  key text not null,
  user_id text not null,
  card jsonb not null,
  due_at timestamptz not null,
  interval_minutes integer not null check (interval_minutes >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists flashcard_reviews_due_idx
  on public.flashcard_reviews (user_id, due_at);

create table if not exists public.study_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 1 and 80),
  user_id text not null,
  title text not null check (char_length(title) between 1 and 200),
  notes text not null check (char_length(notes) between 1 and 50000),
  quiz jsonb not null default '[]'::jsonb,
  flashcards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists study_packs_owner_created_idx
  on public.study_packs (user_id, created_at desc);

alter table public.flashcard_reviews enable row level security;
alter table public.study_packs enable row level security;

revoke all on public.flashcard_reviews, public.study_packs
  from anon, authenticated;
grant all on public.flashcard_reviews, public.study_packs
  to service_role;
