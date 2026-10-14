-- Keep the publisher's description separate from our future editorial/AI summary.
-- Existing articles retain NULL metadata because they were not collected by this job.
alter table public.articles
  add column source_name text,
  add column source_description text,
  add column collected_at timestamptz;

comment on column public.articles.source_description is
  'Plain-text description supplied by the news source, not an AI-generated summary.';
comment on column public.articles.collected_at is
  'When the collector first saved this article. Repeat runs do not change it.';
