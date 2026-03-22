alter table public.values_profiles
  add column if not exists policy_signals jsonb not null default '{}'::jsonb;
