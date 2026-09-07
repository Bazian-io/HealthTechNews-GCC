-- Allow public (anon/authenticated) read access to published articles only.
-- RLS stays enabled; no insert/update/delete policies are added.
create policy "Public can view published articles"
on public.articles
for select
to anon, authenticated
using (status = 'published');
