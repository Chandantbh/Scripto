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

alter table public.exam_sessions
  add column if not exists public_exam jsonb,
  add column if not exists answer_key jsonb,
  add column if not exists answers jsonb not null default '[]'::jsonb,
  add column if not exists completed_at timestamptz;

alter table public.exam_sessions enable row level security;

drop policy if exists "exam_sessions_owner_all" on public.exam_sessions;
create policy "exam_sessions_owner_all" on public.exam_sessions
  for all using ((auth.jwt() ->> 'sub') = user_id)
  with check ((auth.jwt() ->> 'sub') = user_id);

revoke all on public.exam_sessions from anon, authenticated;
grant all on public.exam_sessions to service_role;
