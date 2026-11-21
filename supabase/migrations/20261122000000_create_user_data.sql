create table if not exists public.user_stats (
  user_id text primary key,
  xp integer not null default 0 check (xp >= 0),
  streak integer not null default 0 check (streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_activity_date timestamptz,
  achievements text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_history (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null check (type in ('quiz', 'exam')),
  topic text not null check (char_length(topic) between 1 and 200),
  score double precision not null check (score >= 0),
  total double precision not null check (total > 0 and score <= total),
  grade text check (grade is null or char_length(grade) <= 10),
  created_at timestamptz not null default now()
);

create index if not exists activity_history_user_created_idx
  on public.activity_history (user_id, created_at desc);

create table if not exists public.saved_notes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 50000),
  source_type text not null check (source_type in ('text', 'topic', 'youtube', 'file')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_notes_user_created_idx
  on public.saved_notes (user_id, created_at desc);

alter table public.user_stats enable row level security;
alter table public.activity_history enable row level security;
alter table public.saved_notes enable row level security;

revoke all on public.user_stats, public.activity_history, public.saved_notes
  from anon, authenticated;
grant all on public.user_stats, public.activity_history, public.saved_notes
  to service_role;
