create table if not exists public.ai_usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  window_start timestamptz not null,
  units integer not null default 0 check (units >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, scope, window_start)
);

alter table public.ai_usage_counters enable row level security;

create policy "Users can read own AI usage counters"
  on public.ai_usage_counters for select
  using (auth.uid() = user_id);

create policy "Users can insert own AI usage counters"
  on public.ai_usage_counters for insert
  with check (auth.uid() = user_id);

create policy "Users can update own AI usage counters"
  on public.ai_usage_counters for update
  using (auth.uid() = user_id);

create index if not exists idx_ai_usage_counters_scope_window
  on public.ai_usage_counters (scope, window_start);

create or replace function public.enforce_ai_quota(
  p_scope text,
  p_window_start timestamptz,
  p_max_units integer,
  p_increment integer default 1
)
returns table (
  allowed boolean,
  current_units integer,
  limit_units integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_units integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_max_units <= 0 then
    raise exception 'p_max_units must be positive';
  end if;

  if p_increment <= 0 then
    raise exception 'p_increment must be positive';
  end if;

  loop
    update public.ai_usage_counters
    set
      units = units + p_increment,
      updated_at = now()
    where
      user_id = v_user_id and
      scope = p_scope and
      window_start = p_window_start and
      units + p_increment <= p_max_units
    returning units into v_current_units;

    if found then
      return query select true, v_current_units, p_max_units;
      return;
    end if;

    begin
      insert into public.ai_usage_counters (
        user_id,
        scope,
        window_start,
        units
      )
      values (
        v_user_id,
        p_scope,
        p_window_start,
        p_increment
      )
      returning units into v_current_units;

      return query select true, v_current_units, p_max_units;
      return;
    exception
      when unique_violation then
        null;
    end;

    select units
    into v_current_units
    from public.ai_usage_counters
    where
      user_id = v_user_id and
      scope = p_scope and
      window_start = p_window_start;

    if v_current_units is not null and v_current_units + p_increment > p_max_units then
      return query select false, v_current_units, p_max_units;
      return;
    end if;
  end loop;
end;
$$;

grant execute on function public.enforce_ai_quota(text, timestamptz, integer, integer) to authenticated;
