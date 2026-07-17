create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (
    category in (
      'inaccurate_claim',
      'wrong_party',
      'stale_candidacy',
      'missing_race',
      'unsupported_claim',
      'partisan_bias',
      'other'
    )
  ),
  subject_type text not null check (
    subject_type in ('candidate', 'measure', 'race', 'guide')
  ),
  subject_name text not null check (
    char_length(subject_name) between 1 and 200
  ),
  race_name text check (char_length(race_name) <= 200),
  details text not null check (char_length(details) between 1 and 2000),
  status text not null default 'open' check (
    status in ('open', 'in_review', 'resolved', 'dismissed')
  ),
  resolution_note text check (char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.content_reports enable row level security;

create policy "Users can view their content reports"
  on public.content_reports for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.content_reports from authenticated;

create index if not exists idx_content_reports_status_created
  on public.content_reports (status, created_at desc);

create index if not exists idx_content_reports_user_created
  on public.content_reports (user_id, created_at desc);
