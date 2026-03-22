create extension if not exists "uuid-ossp";

create table if not exists public.saved_ballots (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ballot_input jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_user_saved_ballot unique (user_id)
);

alter table public.saved_ballots enable row level security;

create policy "Users can read own saved ballot"
  on public.saved_ballots for select
  using (auth.uid() = user_id);

create policy "Users can insert own saved ballot"
  on public.saved_ballots for insert
  with check (auth.uid() = user_id);

create policy "Users can update own saved ballot"
  on public.saved_ballots for update
  using (auth.uid() = user_id);

create index if not exists idx_saved_ballots_user on public.saved_ballots (user_id);
