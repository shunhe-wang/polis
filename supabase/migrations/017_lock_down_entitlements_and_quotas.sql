-- Paid entitlements and AI usage counters are server-controlled accounting data.
-- Clients may read their own rows, but may only mutate them through the
-- narrowly scoped security-definer functions below.

drop policy if exists "Users can insert their entitlements row"
  on public.account_entitlements;
drop policy if exists "Users can update their entitlements row"
  on public.account_entitlements;

revoke insert, update on public.account_entitlements from authenticated;

drop policy if exists "Users can insert own AI usage counters"
  on public.ai_usage_counters;
drop policy if exists "Users can update own AI usage counters"
  on public.ai_usage_counters;

revoke insert, update on public.ai_usage_counters from authenticated;

alter function public.enforce_ai_quota(text, timestamptz, integer, integer)
  security definer;

revoke all on function public.enforce_ai_quota(text, timestamptz, integer, integer)
  from public;
grant execute on function public.enforce_ai_quota(text, timestamptz, integer, integer)
  to authenticated;
