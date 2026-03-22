create table if not exists public.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  election_pass_credits integer not null default 0 check (election_pass_credits >= 0),
  power_pass_runs_remaining integer not null default 0 check (power_pass_runs_remaining >= 0),
  power_pass_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_entitlements enable row level security;

create policy "Users can view their entitlements"
  on public.account_entitlements for select
  using (auth.uid() = user_id);

create policy "Users can insert their entitlements row"
  on public.account_entitlements for insert
  with check (auth.uid() = user_id);

create policy "Users can update their entitlements row"
  on public.account_entitlements for update
  using (auth.uid() = user_id);

create table if not exists public.billing_orders (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  product_key text not null,
  quantity integer not null default 1,
  amount_total bigint,
  currency text,
  status text not null default 'completed',
  metadata jsonb not null default '{}'::jsonb,
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.billing_orders enable row level security;

create policy "Users can view their orders"
  on public.billing_orders for select
  using (auth.uid() = user_id);

create table if not exists public.guide_access_grants (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ballot_hash text not null,
  access_source text not null check (access_source in ('election_pass', 'power_pass')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guide_access_grants_user_ballot_key unique (user_id, ballot_hash)
);

alter table public.guide_access_grants enable row level security;

create policy "Users can view their guide grants"
  on public.guide_access_grants for select
  using (auth.uid() = user_id);

create index if not exists idx_guide_access_grants_expires_at
  on public.guide_access_grants (expires_at);

create or replace function public.grant_billing_entitlement(
  p_user_id uuid,
  p_product_key text,
  p_now timestamptz default now()
)
returns table (
  election_pass_credits integer,
  power_pass_runs_remaining integer,
  power_pass_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiry timestamptz;
begin
  insert into public.account_entitlements (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  if p_product_key = 'election_pass' then
    update public.account_entitlements
      set election_pass_credits = election_pass_credits + 1,
          updated_at = p_now
      where user_id = p_user_id;
  elsif p_product_key = 'bundle_3' then
    update public.account_entitlements
      set election_pass_credits = election_pass_credits + 3,
          updated_at = p_now
      where user_id = p_user_id;
  elsif p_product_key = 'power_14d' then
    select
      case
        when power_pass_expires_at is not null and power_pass_expires_at > p_now
          then power_pass_expires_at + interval '14 days'
        else p_now + interval '14 days'
      end
      into v_expiry
    from public.account_entitlements
    where user_id = p_user_id
    for update;

    update public.account_entitlements
      set power_pass_runs_remaining = power_pass_runs_remaining + 10,
          power_pass_expires_at = v_expiry,
          updated_at = p_now
      where user_id = p_user_id;
  else
    raise exception 'Unknown billing product: %', p_product_key;
  end if;

  return query
  select
    e.election_pass_credits,
    e.power_pass_runs_remaining,
    e.power_pass_expires_at
  from public.account_entitlements e
  where e.user_id = p_user_id;
end;
$$;

revoke all on function public.grant_billing_entitlement(uuid, text, timestamptz) from public;
grant execute on function public.grant_billing_entitlement(uuid, text, timestamptz) to service_role;

create or replace function public.consume_guide_access(
  p_user_id uuid,
  p_ballot_hash text,
  p_now timestamptz default now()
)
returns table (
  granted boolean,
  source text,
  election_pass_credits integer,
  power_pass_runs_remaining integer,
  power_pass_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.guide_access_grants%rowtype;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to consume guide access for this user';
  end if;

  select *
    into v_existing
  from public.guide_access_grants
  where user_id = p_user_id
    and ballot_hash = p_ballot_hash
    and (expires_at is null or expires_at > p_now)
  limit 1;

  if found then
    return query
    select
      true,
      v_existing.access_source,
      coalesce(e.election_pass_credits, 0),
      coalesce(e.power_pass_runs_remaining, 0),
      e.power_pass_expires_at
    from public.account_entitlements e
    where e.user_id = p_user_id;
    return;
  end if;

  insert into public.account_entitlements (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  if exists (
    select 1
    from public.account_entitlements
    where user_id = p_user_id
      and power_pass_expires_at is not null
      and power_pass_expires_at > p_now
      and power_pass_runs_remaining > 0
    for update
  ) then
    update public.account_entitlements
      set power_pass_runs_remaining = power_pass_runs_remaining - 1,
          updated_at = p_now
      where user_id = p_user_id;

    insert into public.guide_access_grants (user_id, ballot_hash, access_source, expires_at, updated_at)
    select p_user_id, p_ballot_hash, 'power_pass', power_pass_expires_at, p_now
    from public.account_entitlements
    where user_id = p_user_id
    on conflict (user_id, ballot_hash)
    do update set
      access_source = excluded.access_source,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at;

    return query
    select
      true,
      'power_pass',
      e.election_pass_credits,
      e.power_pass_runs_remaining,
      e.power_pass_expires_at
    from public.account_entitlements e
    where e.user_id = p_user_id;
    return;
  end if;

  if exists (
    select 1
    from public.account_entitlements
    where user_id = p_user_id
      and election_pass_credits > 0
    for update
  ) then
    update public.account_entitlements
      set election_pass_credits = election_pass_credits - 1,
          updated_at = p_now
      where user_id = p_user_id;

    insert into public.guide_access_grants (user_id, ballot_hash, access_source, expires_at, updated_at)
    values (p_user_id, p_ballot_hash, 'election_pass', null, p_now)
    on conflict (user_id, ballot_hash)
    do update set
      access_source = excluded.access_source,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at;

    return query
    select
      true,
      'election_pass',
      e.election_pass_credits,
      e.power_pass_runs_remaining,
      e.power_pass_expires_at
    from public.account_entitlements e
    where e.user_id = p_user_id;
    return;
  end if;

  return query
  select
    false,
    null::text,
    e.election_pass_credits,
    e.power_pass_runs_remaining,
    e.power_pass_expires_at
  from public.account_entitlements e
  where e.user_id = p_user_id;
end;
$$;

revoke all on function public.consume_guide_access(uuid, text, timestamptz) from public;
grant execute on function public.consume_guide_access(uuid, text, timestamptz) to authenticated;
