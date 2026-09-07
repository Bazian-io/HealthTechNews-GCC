-- Table-level SELECT grant, required for the RLS policy on public.articles
-- to have any effect via the anon/authenticated PostgREST roles. Row
-- visibility is still fully governed by the existing RLS policy
-- (status = 'published'). No insert/update/delete privileges are granted.
grant select on public.articles to anon, authenticated;
