-- Apply with the Supabase SQL editor or migrations runner.
alter table public.user_stats enable row level security;
alter table public.activity_history enable row level security;
alter table public.saved_notes enable row level security;
alter table public.flashcard_reviews enable row level security;
alter table public.study_packs enable row level security;

create policy "user_stats_own_rows" on public.user_stats
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "activity_history_own_rows" on public.activity_history
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "saved_notes_own_rows" on public.saved_notes
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "flashcard_reviews_own_rows" on public.flashcard_reviews
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "study_packs_owner_all" on public.study_packs
  for all using (auth.jwt() ->> 'sub' = user_id)
  with check (auth.jwt() ->> 'sub' = user_id);

create policy "study_packs_public_read" on public.study_packs
  for select to anon, authenticated
  using (slug is not null);
