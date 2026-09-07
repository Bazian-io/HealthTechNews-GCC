-- One-off seed: a single published test article for the
-- Supabase -> Next.js -> browser functional test.
insert into public.articles
  (title, summary, country, category, original_url, status, published_at)
values (
  'Saudi HealthTech Startup Expands Digital Care Platform',
  'A Saudi healthtech company is expanding its digital care platform to improve access to technology-enabled healthcare services.',
  'Saudi Arabia',
  'Digital Health',
  'https://example.com/saudi-healthtech-test-article',
  'published',
  now()
);
