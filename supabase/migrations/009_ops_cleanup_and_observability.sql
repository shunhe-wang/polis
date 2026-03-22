create table if not exists public.app_event_logs (
  id uuid primary key default extensions.uuid_generate_v4(),
  category text not null,
  event text not null,
  severity text not null default 'info',
  route text,
  user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_event_logs enable row level security;

create index if not exists idx_app_event_logs_created_at
  on public.app_event_logs (created_at desc);

create index if not exists idx_app_event_logs_category_event
  on public.app_event_logs (category, event);

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
    'research_dossiers_deleted', v_dossiers_deleted,
    'guide_access_grants_deleted', v_guide_grants_deleted,
    'app_event_logs_deleted', v_logs_deleted
  );
end;
$$;

revoke all on function public.cleanup_app_operational_data(timestamptz) from public;
grant execute on function public.cleanup_app_operational_data(timestamptz) to service_role;
