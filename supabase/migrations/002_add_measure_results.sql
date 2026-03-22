-- Add measure_results column to voter_guides for ballot measure research results
alter table public.voter_guides
  add column if not exists measure_results jsonb default null;
