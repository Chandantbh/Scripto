create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_title text not null,
  front text not null,
  back text not null,
  ease double precision not null default 2.5 check (ease >= 1.3),
  interval_days integer not null default 0 check (interval_days >= 0),
  reps integer not null default 0 check (reps >= 0),
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  starred boolean not null default false
);

create index if not exists flashcards_owner_due_idx
  on public.flashcards (user_id, due_at);

insert into public.flashcards (
  user_id, source_title, front, back, ease, interval_days, reps, due_at, last_reviewed_at
)
select
  reviews.user_id,
  'Imported flashcards',
  reviews.card ->> 'question',
  reviews.card ->> 'answer',
  2.5,
  greatest(0, round(reviews.interval_minutes / 1440.0)::integer),
  greatest(0, reviews.repetitions),
  reviews.due_at,
  case when reviews.repetitions > 0 then reviews.updated_at else null end
from public.flashcard_reviews as reviews
where nullif(reviews.card ->> 'question', '') is not null
  and nullif(reviews.card ->> 'answer', '') is not null
  and not exists (
    select 1
    from public.flashcards as existing
    where existing.user_id = reviews.user_id
      and existing.front = (reviews.card ->> 'question')
      and existing.back = (reviews.card ->> 'answer')
  );

create table if not exists public.study_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_title text not null,
  mode text not null check (mode in ('quiz', 'exam')),
  score double precision not null check (score >= 0),
  total double precision not null check (total > 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  missed_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (score <= total)
);

create index if not exists study_attempts_owner_created_idx
  on public.study_attempts (user_id, created_at desc);

create table if not exists public.topic_mastery (
  user_id text not null,
  topic text not null,
  mastery_score double precision not null default 0 check (mastery_score between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic)
);

create table if not exists public.concept_maps (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_title text not null,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_title text not null,
  public_exam jsonb not null,
  answer_key jsonb not null,
  answers jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  duration_seconds integer not null check (duration_seconds > 0),
  completed_at timestamptz
);

create index if not exists exam_sessions_owner_started_idx
  on public.exam_sessions (user_id, started_at desc);

alter table public.flashcards enable row level security;
alter table public.study_attempts enable row level security;
alter table public.topic_mastery enable row level security;
alter table public.concept_maps enable row level security;
alter table public.exam_sessions enable row level security;

create policy "flashcards_owner_all" on public.flashcards
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "study_attempts_owner_all" on public.study_attempts
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "topic_mastery_owner_all" on public.topic_mastery
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "concept_maps_owner_all" on public.concept_maps
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "exam_sessions_owner_all" on public.exam_sessions
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

revoke all on public.flashcards, public.study_attempts, public.topic_mastery,
  public.concept_maps, public.exam_sessions from anon, authenticated;
grant all on public.flashcards, public.study_attempts, public.topic_mastery,
  public.concept_maps, public.exam_sessions to service_role;
