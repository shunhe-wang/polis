create table if not exists public.research_dossiers (
  id uuid primary key default extensions.uuid_generate_v4(),
  kind text not null check (kind in ('candidate', 'measure')),
  cache_key text not null,
  title text not null,
  state text not null,
  dossier jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint research_dossiers_kind_cache_key_key unique (kind, cache_key)
);

alter table public.research_dossiers enable row level security;

create index if not exists idx_research_dossiers_expires_at
  on public.research_dossiers (expires_at);

create index if not exists idx_research_dossiers_title_state
  on public.research_dossiers (title, state);
