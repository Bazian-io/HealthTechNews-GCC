-- The backend collector inserts drafts and reads insertion results.
-- Bypassing RLS does not replace table grants. Public reader permissions stay unchanged.
grant select, insert on public.articles to service_role;
