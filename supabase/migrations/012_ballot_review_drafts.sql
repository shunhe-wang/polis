create table if not exists public.ballot_review_drafts (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('pasted_text')),
  text_hash text not null,
  raw_text text not null,
  parsed_ballot jsonb not null,
  confidence integer not null default 50 check (confidence >= 0 and confidence <= 100),
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ballot_review_drafts_user_text_hash_key unique (user_id, text_hash)
);

alter table public.ballot_review_drafts enable row level security;

create policy "Users can view their ballot review drafts"
  on public.ballot_review_drafts for select
  using (auth.uid() = user_id);

create policy "Users can insert their ballot review drafts"
  on public.ballot_review_drafts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their ballot review drafts"
  on public.ballot_review_drafts for update
  using (auth.uid() = user_id);

create index if not exists idx_ballot_review_drafts_user_updated
  on public.ballot_review_drafts (user_id, updated_at desc);
