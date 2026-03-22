create table if not exists public.research_item_cache (
  kind text not null check (kind in ('candidate', 'measure')),
  cache_key text not null,
  title text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (kind, cache_key)
);

alter table public.research_item_cache enable row level security;

create index if not exists idx_research_item_cache_expires_at
  on public.research_item_cache (expires_at);

create index if not exists idx_research_item_cache_title
  on public.research_item_cache (title);

create or replace function public.cleanup_app_operational_data(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ai_usage_deleted integer := 0;
  v_research_cache_deleted integer := 0;
  v_item_cache_deleted integer := 0;
  v_dossiers_deleted integer := 0;
  v_guide_grants_deleted integer := 0;
  v_logs_deleted integer := 0;
begin
  delete from public.ai_usage_counters
  where scope <> 'starter_candidate_analysis_lifetime'
    and window_start < p_now - interval '35 days';
  get diagnostics v_ai_usage_deleted = row_count;

  delete from public.research_cache_entries
  where expires_at < p_now - interval '1 day';
  get diagnostics v_research_cache_deleted = row_count;

  delete from public.research_item_cache
  where expires_at < p_now - interval '1 day';
  get diagnostics v_item_cache_deleted = row_count;

  delete from public.research_dossiers
  where expires_at < p_now - interval '1 day';
  get diagnostics v_dossiers_deleted = row_count;

  delete from public.guide_access_grants
  where expires_at is not null
    and expires_at < p_now - interval '1 day';
  get diagnostics v_guide_grants_deleted = row_count;

  delete from public.app_event_logs
  where created_at < p_now - interval '30 days';
  get diagnostics v_logs_deleted = row_count;

  return jsonb_build_object(
    'ai_usage_counters_deleted', v_ai_usage_deleted,
    'research_cache_entries_deleted', v_research_cache_deleted,
    'research_item_cache_deleted', v_item_cache_deleted,
    'research_dossiers_deleted', v_dossiers_deleted,
    'guide_access_grants_deleted', v_guide_grants_deleted,
    'app_event_logs_deleted', v_logs_deleted
  );
end;
$$;

revoke all on function public.cleanup_app_operational_data(timestamptz) from public;
grant execute on function public.cleanup_app_operational_data(timestamptz) to service_role;
