create table if not exists public.jurisdiction_fallbacks (
  id uuid primary key default extensions.uuid_generate_v4(),
  state_code text not null,
  county_name text,
  city_name text,
  jurisdiction_key text not null unique,
  official_elections_url text not null,
  official_sample_ballot_url text,
  official_voter_lookup_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jurisdiction_fallbacks enable row level security;

create policy "Authenticated users can read jurisdiction fallbacks"
  on public.jurisdiction_fallbacks for select
  using (auth.role() = 'authenticated');

create index if not exists idx_jurisdiction_fallbacks_state_city
  on public.jurisdiction_fallbacks (state_code, city_name);

create table if not exists public.ballot_imports (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  lookup_key text not null unique,
  address_hash text not null,
  normalized_address text,
  state_code text,
  county_name text,
  city_name text,
  election_name text,
  election_day date,
  election_kind text,
  election_source_id text,
  selected_party text,
  source text not null check (source in ('google_civic', 'official_upload', 'manual', 'licensed_provider')),
  source_status text not null check (source_status in ('complete', 'partial', 'unavailable')),
  source_confidence integer not null default 50 check (source_confidence >= 0 and source_confidence <= 100),
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ballot_imports enable row level security;

create policy "Users can view their own ballot imports"
  on public.ballot_imports for select
  using (auth.uid() = user_id);

create index if not exists idx_ballot_imports_user_created
  on public.ballot_imports (user_id, created_at desc);

create index if not exists idx_ballot_imports_address_hash
  on public.ballot_imports (address_hash, created_at desc);

create table if not exists public.ballot_import_contests (
  id uuid primary key default extensions.uuid_generate_v4(),
  ballot_import_id uuid not null references public.ballot_imports(id) on delete cascade,
  kind text not null check (kind in ('race', 'measure')),
  source_contest_id text,
  title text not null,
  office_name text,
  contest_type text,
  level text,
  district text,
  description text,
  sort_order integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ballot_import_contests enable row level security;

create policy "Users can view contests on their ballot imports"
  on public.ballot_import_contests for select
  using (
    exists (
      select 1
      from public.ballot_imports bi
      where bi.id = ballot_import_contests.ballot_import_id
        and bi.user_id = auth.uid()
    )
  );

create index if not exists idx_ballot_import_contests_import
  on public.ballot_import_contests (ballot_import_id, sort_order);

create table if not exists public.ballot_import_candidates (
  id uuid primary key default extensions.uuid_generate_v4(),
  contest_id uuid not null references public.ballot_import_contests(id) on delete cascade,
  source_candidate_id text,
  name text not null,
  party text,
  website_url text,
  sort_order integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ballot_import_candidates enable row level security;

create policy "Users can view candidates on their ballot imports"
  on public.ballot_import_candidates for select
  using (
    exists (
      select 1
      from public.ballot_import_contests bic
      join public.ballot_imports bi on bi.id = bic.ballot_import_id
      where bic.id = ballot_import_candidates.contest_id
        and bi.user_id = auth.uid()
    )
  );

create index if not exists idx_ballot_import_candidates_contest
  on public.ballot_import_candidates (contest_id, sort_order);

insert into public.jurisdiction_fallbacks (
  state_code,
  county_name,
  city_name,
  jurisdiction_key,
  official_elections_url,
  official_sample_ballot_url,
  official_voter_lookup_url,
  notes
)
values
  (
    'VA',
    null,
    null,
    'va::::',
    'https://www.elections.virginia.gov/',
    null,
    null,
    'Virginia Department of Elections root page'
  ),
  (
    'MD',
    null,
    null,
    'md::::',
    'https://elections.maryland.gov/',
    null,
    null,
    'Maryland State Board of Elections root page'
  ),
  (
    'DC',
    null,
    null,
    'dc::::',
    'https://www.dcboe.org/',
    null,
    null,
    'District of Columbia Board of Elections root page'
  ),
  (
    'CA',
    null,
    null,
    'ca::::',
    'https://www.sos.ca.gov/elections',
    null,
    null,
    'California Secretary of State elections page'
  )
on conflict (jurisdiction_key) do update set
  official_elections_url = excluded.official_elections_url,
  official_sample_ballot_url = excluded.official_sample_ballot_url,
  official_voter_lookup_url = excluded.official_voter_lookup_url,
  notes = excluded.notes,
  updated_at = now();
