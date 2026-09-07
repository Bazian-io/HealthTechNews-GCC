create table public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  country text,
  category text,
  original_url text not null unique,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.articles enable row level security;

-- No policies yet: with RLS enabled and no policies, all access via the
-- anon/authenticated (publishable) API key is denied by default. Only
-- service-role access bypasses RLS. Policies will be added in a later step.