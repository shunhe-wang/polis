-- Refund and revocation support. Apple reports refunds through App Store
-- Server Notifications and Stripe through charge.refunded webhooks; both paths
-- revoke the credits the purchase granted (floored at zero, since credits may
-- already have been spent).

alter table public.app_store_transactions
  add column if not exists revoked_at timestamptz,
  add column if not exists revocation_reason text;

alter table public.billing_orders
  add column if not exists revoked_at timestamptz,
  add column if not exists revocation_reason text;

create or replace function public.revoke_app_store_transaction(
  p_transaction_id text,
  p_revocation_date timestamptz default null,
  p_reason text default null
)
returns table (
  found_transaction boolean,
  already_revoked boolean,
  credits_revoked integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.app_store_transactions%rowtype;
  v_credits integer := 0;
begin
  select * into v_row
  from public.app_store_transactions
  where transaction_id = p_transaction_id
  for update;

  if not found then
    return query select false, false, 0;
    return;
  end if;

  if v_row.revoked_at is not null then
    return query select true, true, 0;
    return;
  end if;

  update public.app_store_transactions
  set
    revoked_at = coalesce(p_revocation_date, now()),
    revocation_reason = p_reason
  where transaction_id = p_transaction_id;

  if v_row.user_id is not null and v_row.credits_granted > 0 then
    update public.account_entitlements
    set
      election_pass_credits =
        greatest(election_pass_credits - v_row.credits_granted, 0),
      updated_at = now()
    where user_id = v_row.user_id;
    v_credits := v_row.credits_granted;
  end if;

  return query select true, false, v_credits;
end;
$$;

revoke execute on function public.revoke_app_store_transaction(text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.revoke_app_store_transaction(text, timestamptz, text)
  to service_role;

create or replace function public.revoke_billing_order(
  p_stripe_payment_intent_id text,
  p_reason text default null
)
returns table (
  found_order boolean,
  already_revoked boolean,
  credits_revoked integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.billing_orders%rowtype;
  v_credits integer := 0;
begin
  select * into v_row
  from public.billing_orders
  where stripe_payment_intent_id = p_stripe_payment_intent_id
  order by purchased_at desc
  limit 1
  for update;

  if not found then
    return query select false, false, 0;
    return;
  end if;

  if v_row.revoked_at is not null then
    return query select true, true, 0;
    return;
  end if;

  update public.billing_orders
  set
    revoked_at = now(),
    revocation_reason = p_reason
  where id = v_row.id;

  -- Derive the granted credits from the product itself; the credits_granted
  -- bookkeeping column is only populated for election_pass orders.
  v_credits := case v_row.product_key
    when 'election_pass' then v_row.quantity
    when 'bundle_3' then 3 * v_row.quantity
    else 0
  end;

  if v_row.user_id is not null and v_credits > 0 then
    update public.account_entitlements
    set
      election_pass_credits = greatest(election_pass_credits - v_credits, 0),
      updated_at = now()
    where user_id = v_row.user_id;
  else
    v_credits := 0;
  end if;

  return query select true, false, v_credits;
end;
$$;

revoke execute on function public.revoke_billing_order(text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_billing_order(text, text)
  to service_role;
