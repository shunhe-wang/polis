create table if not exists public.ai_data_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_version text not null,
  provider text not null,
  purpose text not null,
  granted_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, consent_version)
);

alter table public.ai_data_consents enable row level security;

create policy "Users can view their AI data consents"
  on public.ai_data_consents for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.ai_data_consents from authenticated;

create index if not exists idx_ai_data_consents_user_granted
  on public.ai_data_consents (user_id, granted_at desc);
