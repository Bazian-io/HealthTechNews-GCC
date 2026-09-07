-- Add a slug column for article detail page URLs (/news/[slug]).
-- Nullable for now; enforced unique so each article maps to one URL.
alter table public.articles
  add column slug text unique;
