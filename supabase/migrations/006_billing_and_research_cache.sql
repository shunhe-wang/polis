create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_customers enable row level security;

create policy "Users can read own billing customer"
  on public.billing_customers for select
  using (auth.uid() = user_id);

create policy "Users can insert own billing customer"
  on public.billing_customers for insert
  with check (auth.uid() = user_id);

create policy "Users can update own billing customer"
  on public.billing_customers for update
  using (auth.uid() = user_id);

create table if not exists public.billing_subscriptions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  plan_key text not null,
  status text not null,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_subscriptions enable row level security;

create policy "Users can read own subscriptions"
  on public.billing_subscriptions for select
  using (auth.uid() = user_id);

create index if not exists idx_billing_subscriptions_user_status
  on public.billing_subscriptions (user_id, status, current_period_end desc);

create index if not exists idx_billing_subscriptions_customer
  on public.billing_subscriptions (stripe_customer_id);

create table if not exists public.starter_candidate_analyses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  candidate_id text not null,
  candidate_name text not null,
  race_id text not null,
  race_name text not null,
  values_profile_hash text not null,
  ballot_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.starter_candidate_analyses enable row level security;

create policy "Users can read own starter analysis"
  on public.starter_candidate_analyses for select
  using (auth.uid() = user_id);

create policy "Users can insert own starter analysis"
  on public.starter_candidate_analyses for insert
  with check (auth.uid() = user_id);

create policy "Users can update own starter analysis"
  on public.starter_candidate_analyses for update
  using (auth.uid() = user_id);

create table if not exists public.research_cache_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  results jsonb not null default '[]'::jsonb,
  measure_results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, cache_key)
);

alter table public.research_cache_entries enable row level security;

create policy "Users can read own research cache"
  on public.research_cache_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own research cache"
  on public.research_cache_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own research cache"
  on public.research_cache_entries for update
  using (auth.uid() = user_id);

create index if not exists idx_research_cache_entries_expires_at
  on public.research_cache_entries (expires_at);
