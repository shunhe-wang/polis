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
      coalesce(ent.election_pass_credits, 0),
      coalesce(ent.power_pass_runs_remaining, 0),
      ent.power_pass_expires_at
    from public.account_entitlements as ent
    where ent.user_id = p_user_id;
    return;
  end if;

  insert into public.account_entitlements (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  if exists (
    select 1
    from public.account_entitlements as ent
    where ent.user_id = p_user_id
      and ent.election_pass_credits > 0
    for update
  ) then
    update public.account_entitlements as ent
      set election_pass_credits = ent.election_pass_credits - 1,
          updated_at = p_now
      where ent.user_id = p_user_id;

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
      ent.election_pass_credits,
      coalesce(ent.power_pass_runs_remaining, 0),
      ent.power_pass_expires_at
    from public.account_entitlements as ent
    where ent.user_id = p_user_id;
    return;
  end if;

  return query
  select
    false,
    null::text,
    ent.election_pass_credits,
    coalesce(ent.power_pass_runs_remaining, 0),
    ent.power_pass_expires_at
  from public.account_entitlements as ent
  where ent.user_id = p_user_id;
end;
$$;
