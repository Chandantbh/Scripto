-- 1. Flashcards (SM-2 Spaced Repetition)
create table if not exists public.flashcards (
  id text primary key,
  user_id text not null,
  source_title text not null default 'General',
  front text not null,
  back text not null,
  ease double precision not null default 2.5,
  interval_days integer not null default 0,
  reps integer not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  starred boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_flashcards_user_due on public.flashcards (user_id, due_at);

-- 2. Study Attempts (Quiz & Exam History)
create table if not exists public.study_attempts (
  id text primary key,
  user_id text not null,
  source_title text not null,
  mode text not null check (mode in ('quiz', 'exam')),
  score integer not null,
  total integer not null,
  duration_seconds integer,
  missed_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_study_attempts_user on public.study_attempts (user_id, created_at desc);

-- 3. Topic Mastery
create table if not exists public.topic_mastery (
  user_id text not null,
  topic text not null,
  mastery_score double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic)
);

-- 4. Concept Maps
create table if not exists public.concept_maps (
  id text primary key,
  user_id text not null,
  source_title text not null,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_concept_maps_user on public.concept_maps (user_id, created_at desc);

-- 5. Exam Sessions (Tamper-Proof Timer & Server Grading)
create table if not exists public.exam_sessions (
  id text primary key,
  user_id text not null,
  source_title text not null,
  questions jsonb not null,
  public_exam jsonb not null,
  answer_key jsonb not null,
  answers jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  duration_seconds integer not null,
  submitted_at timestamptz,
  score integer,
  completed_at timestamptz
);

-- 6. Enable Row Level Security (RLS)
alter table public.flashcards enable row level security;
alter table public.study_attempts enable row level security;
alter table public.topic_mastery enable row level security;
alter table public.concept_maps enable row level security;
alter table public.exam_sessions enable row level security;

-- 7. Owner Policies (Clerk JWT `sub` match)
drop policy if exists "flashcards_owner_all" on public.flashcards;
create policy "flashcards_owner_all" on public.flashcards
  for all using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

drop policy if exists "study_attempts_owner_all" on public.study_attempts;
create policy "study_attempts_owner_all" on public.study_attempts
  for all using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

drop policy if exists "topic_mastery_owner_all" on public.topic_mastery;
create policy "topic_mastery_owner_all" on public.topic_mastery
  for all using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

drop policy if exists "concept_maps_owner_all" on public.concept_maps;
create policy "concept_maps_owner_all" on public.concept_maps
  for all using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

drop policy if exists "exam_sessions_owner_all" on public.exam_sessions;
create policy "exam_sessions_owner_all" on public.exam_sessions
  for all using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

-- 8. Lock Down Direct Client Access (Server-Side `service_role` Only)
revoke all on public.flashcards, public.study_attempts, public.topic_mastery,
  public.concept_maps, public.exam_sessions from anon, authenticated;

grant all on public.flashcards, public.study_attempts, public.topic_mastery,
  public.concept_maps, public.exam_sessions to service_role;