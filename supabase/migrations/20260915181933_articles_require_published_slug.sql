-- Published articles need a slug containing at least one non-whitespace character.
-- Drafts may still have no slug. The existing unique slug constraint stays in place.
alter table public.articles
  add constraint articles_published_slug_required
  check (
    status <> 'published'
    or (slug is not null and slug ~ '[^[:space:]]')
  );
