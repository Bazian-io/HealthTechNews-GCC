-- Publisher-hosted lead image address, supplied by FreeNewsAPI.ai. The image is
-- not copied; the website loads it from the publisher. Existing rows stay NULL.
-- Table-level grants already cover new columns, so no grant changes are needed.
alter table public.articles
  add column image_url text,
  add constraint articles_image_url_https
    check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2000));

comment on column public.articles.image_url is
  'Publisher-hosted lead image URL from the news source. Not stored or rehosted by this project.';
