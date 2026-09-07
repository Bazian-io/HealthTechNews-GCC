-- Give the existing seed test article its slug.
update public.articles
set slug = 'saudi-healthtech-startup-expands-digital-care-platform'
where original_url = 'https://example.com/saudi-healthtech-test-article';
