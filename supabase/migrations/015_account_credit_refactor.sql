alter table public.billing_orders
  add column if not exists fulfilled_at timestamptz,
  add column if not exists credits_granted integer not null default 0;

create or replace function public.grant_billing_entitlement(
  p_user_id uuid,
  p_product_key text,
  p_quantity integer,
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
  v_effective_quantity integer := greatest(coalesce(p_quantity, 1), 1);
begin
  insert into public.account_entitlements (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  if p_product_key = 'election_pass' then
    update public.account_entitlements as ent
      set election_pass_credits = ent.election_pass_credits + v_effective_quantity,
          updated_at = p_now
      where ent.user_id = p_user_id;
  elsif p_product_key = 'bundle_3' then
    update public.account_entitlements as ent
      set election_pass_credits = ent.election_pass_credits + (3 * v_effective_quantity),
          updated_at = p_now
      where ent.user_id = p_user_id;
  elsif p_product_key = 'power_14d' then
    update public.account_entitlements as ent
      set power_pass_runs_remaining = ent.power_pass_runs_remaining + (10 * v_effective_quantity),
          power_pass_expires_at = case
            when ent.power_pass_expires_at is not null and ent.power_pass_expires_at > p_now
              then ent.power_pass_expires_at + interval '14 days'
            else p_now + interval '14 days'
          end,
          updated_at = p_now
      where ent.user_id = p_user_id;
  else
    raise exception 'Unknown billing product: %', p_product_key;
  end if;

  return query
  select
    ent.election_pass_credits,
    ent.power_pass_runs_remaining,
    ent.power_pass_expires_at
  from public.account_entitlements as ent
  where ent.user_id = p_user_id;
end;
$$;

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
language sql
security definer
set search_path = public
as $$
  select *
  from public.grant_billing_entitlement(
    p_user_id,
    p_product_key,
    1,
    p_now
  );
$$;

revoke all on function public.grant_billing_entitlement(uuid, text, integer, timestamptz) from public;
grant execute on function public.grant_billing_entitlement(uuid, text, integer, timestamptz) to service_role;
revoke all on function public.grant_billing_entitlement(uuid, text, timestamptz) from public;
grant execute on function public.grant_billing_entitlement(uuid, text, timestamptz) to service_role;

create or replace function public.fulfill_billing_checkout(
  p_user_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_customer_id text,
  p_stripe_payment_intent_id text,
  p_product_key text,
  p_quantity integer,
  p_amount_total bigint,
  p_currency text,
  p_status text,
  p_metadata jsonb,
  p_purchased_at timestamptz,
  p_now timestamptz default now()
)
returns table (
  already_fulfilled boolean,
  election_pass_credits integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.billing_orders%rowtype;
  v_entitlement public.account_entitlements%rowtype;
  v_effective_quantity integer := greatest(coalesce(p_quantity, 1), 1);
begin
  if p_stripe_customer_id is not null then
    insert into public.billing_customers (user_id, stripe_customer_id, updated_at)
    values (p_user_id, p_stripe_customer_id, p_now)
    on conflict (user_id) do update
      set stripe_customer_id = excluded.stripe_customer_id,
          updated_at = excluded.updated_at;
  end if;

  insert into public.billing_orders (
    user_id,
    stripe_checkout_session_id,
    stripe_customer_id,
    stripe_payment_intent_id,
    product_key,
    quantity,
    amount_total,
    currency,
    status,
    metadata,
    purchased_at
  )
  values (
    p_user_id,
    p_stripe_checkout_session_id,
    p_stripe_customer_id,
    p_stripe_payment_intent_id,
    p_product_key,
    v_effective_quantity,
    p_amount_total,
    p_currency,
    coalesce(p_status, 'completed'),
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_purchased_at, p_now)
  )
  on conflict (stripe_checkout_session_id) do update
    set user_id = excluded.user_id,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_payment_intent_id = excluded.stripe_payment_intent_id,
        product_key = excluded.product_key,
        quantity = excluded.quantity,
        amount_total = excluded.amount_total,
        currency = excluded.currency,
        status = excluded.status,
        metadata = excluded.metadata,
        purchased_at = excluded.purchased_at;

  select *
    into v_order
  from public.billing_orders
  where stripe_checkout_session_id = p_stripe_checkout_session_id
  for update;

  if v_order.fulfilled_at is not null then
    select *
      into v_entitlement
    from public.account_entitlements
    where user_id = p_user_id;

    return query
    select
      true,
      coalesce(v_entitlement.election_pass_credits, 0);
    return;
  end if;

  perform *
  from public.grant_billing_entitlement(
    p_user_id,
    p_product_key,
    v_effective_quantity,
    p_now
  );

  update public.billing_orders
    set fulfilled_at = p_now,
        credits_granted = case
          when p_product_key = 'election_pass' then v_effective_quantity
          else credits_granted
        end
    where id = v_order.id;

  select *
    into v_entitlement
  from public.account_entitlements
  where user_id = p_user_id;

  return query
  select
    false,
    coalesce(v_entitlement.election_pass_credits, 0);
end;
$$;

revoke all on function public.fulfill_billing_checkout(uuid, text, text, text, text, integer, bigint, text, text, jsonb, timestamptz, timestamptz) from public;
grant execute on function public.fulfill_billing_checkout(uuid, text, text, text, text, integer, bigint, text, text, jsonb, timestamptz, timestamptz) to service_role;

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
      'existing',
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
      coalesce(e.power_pass_runs_remaining, 0),
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
    coalesce(e.power_pass_runs_remaining, 0),
    e.power_pass_expires_at
  from public.account_entitlements e
  where e.user_id = p_user_id;
end;
$$;
