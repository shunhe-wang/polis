-- Polis initial schema
-- Run this in the Supabase SQL Editor after creating your project.

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── Values Profiles ───────────────────────────────────────────────
create table public.values_profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  issue_ratings jsonb not null,
  free_text text not null default '',
  political_identity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint unique_user_profile unique (user_id)
);

alter table public.values_profiles enable row level security;

create policy "Users can read own profile"
  on public.values_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own profile"
  on public.values_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.values_profiles for update
  using (auth.uid() = user_id);

-- ─── Voter Guides ──────────────────────────────────────────────────
create table public.voter_guides (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  values_profile jsonb not null,
  ballot_input jsonb not null,
  recommendations jsonb not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.voter_guides enable row level security;

create policy "Users can read own guides"
  on public.voter_guides for select
  using (auth.uid() = user_id);

create policy "Users can insert own guides"
  on public.voter_guides for insert
  with check (auth.uid() = user_id);

create policy "Anyone can read public guides"
  on public.voter_guides for select
  using (is_public = true);

-- ─── Index for public guide lookups ────────────────────────────────
create index idx_voter_guides_public on public.voter_guides (id) where is_public = true;
create index idx_voter_guides_user on public.voter_guides (user_id);
