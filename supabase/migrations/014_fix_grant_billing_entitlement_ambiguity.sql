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
    update public.account_entitlements as ent
      set election_pass_credits = ent.election_pass_credits + 1,
          updated_at = p_now
      where ent.user_id = p_user_id;
  elsif p_product_key = 'bundle_3' then
    update public.account_entitlements as ent
      set election_pass_credits = ent.election_pass_credits + 3,
          updated_at = p_now
      where ent.user_id = p_user_id;
  elsif p_product_key = 'power_14d' then
    select
      case
        when ent.power_pass_expires_at is not null
          and ent.power_pass_expires_at > p_now
          then ent.power_pass_expires_at + interval '14 days'
        else p_now + interval '14 days'
      end
      into v_expiry
    from public.account_entitlements as ent
    where ent.user_id = p_user_id
    for update;

    update public.account_entitlements as ent
      set power_pass_runs_remaining = ent.power_pass_runs_remaining + 10,
          power_pass_expires_at = v_expiry,
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

revoke all on function public.grant_billing_entitlement(uuid, text, timestamptz) from public;
grant execute on function public.grant_billing_entitlement(uuid, text, timestamptz) to service_role;
