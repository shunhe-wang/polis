create or replace function public.fulfill_app_store_transaction(
  p_user_id uuid,
  p_transaction_id text,
  p_original_transaction_id text,
  p_app_account_token uuid,
  p_product_id text,
  p_product_key text,
  p_environment text,
  p_purchase_date timestamptz,
  p_quantity integer,
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
  v_transaction public.app_store_transactions%rowtype;
  v_credits integer := 0;
begin
  if p_user_id is null or p_app_account_token is distinct from p_user_id then
    raise exception 'App Store transaction account mismatch';
  end if;
  if nullif(trim(p_transaction_id), '') is null
    or nullif(trim(p_original_transaction_id), '') is null then
    raise exception 'App Store transaction identifiers are required';
  end if;
  if p_product_key <> 'election_pass' then
    raise exception 'Unknown App Store billing product: %', p_product_key;
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'App Store transaction quantity is invalid';
  end if;

  insert into public.app_store_transactions (
    transaction_id,
    original_transaction_id,
    user_id,
    app_account_token,
    product_id,
    product_key,
    environment,
    purchase_date,
    quantity
  )
  values (
    p_transaction_id,
    p_original_transaction_id,
    p_user_id,
    p_app_account_token,
    p_product_id,
    p_product_key,
    p_environment,
    p_purchase_date,
    p_quantity
  )
  on conflict (transaction_id) do nothing;

  select *
    into v_transaction
  from public.app_store_transactions
  where transaction_id = p_transaction_id
  for update;

  if v_transaction.user_id is distinct from p_user_id
    or v_transaction.app_account_token is distinct from p_app_account_token
    or v_transaction.original_transaction_id is distinct from p_original_transaction_id
    or v_transaction.product_id is distinct from p_product_id
    or v_transaction.product_key is distinct from p_product_key
    or v_transaction.environment is distinct from p_environment
    or v_transaction.quantity is distinct from p_quantity then
    raise exception 'App Store transaction was already claimed with different data';
  end if;

  if v_transaction.fulfilled_at is not null then
    select coalesce(ent.election_pass_credits, 0)
      into v_credits
    from public.account_entitlements as ent
    where ent.user_id = p_user_id;

    return query select true, coalesce(v_credits, 0);
    return;
  end if;

  perform *
  from public.grant_billing_entitlement(
    p_user_id,
    p_product_key,
    p_quantity,
    p_now
  );

  update public.app_store_transactions
    set fulfilled_at = p_now,
        credits_granted = p_quantity
    where transaction_id = p_transaction_id;

  select coalesce(ent.election_pass_credits, 0)
    into v_credits
  from public.account_entitlements as ent
  where ent.user_id = p_user_id;

  return query select false, coalesce(v_credits, 0);
end;
$$;

revoke all on function public.fulfill_app_store_transaction(
  uuid, text, text, uuid, text, text, text, timestamptz, integer, timestamptz
) from public;
grant execute on function public.fulfill_app_store_transaction(
  uuid, text, text, uuid, text, text, text, timestamptz, integer, timestamptz
) to service_role;
