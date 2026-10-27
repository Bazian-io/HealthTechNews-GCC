-- The opening of the publisher's article (about 100-150 words), shown with clear
-- attribution and a link to the original. The full article text is not stored.
-- Kept separate from source_description and from editorial/AI summary.
-- Existing rows stay NULL. Table-level grants already cover new columns.
alter table public.articles
  add column source_lead text,
  add constraint articles_source_lead_length
    check (source_lead is null or char_length(source_lead) <= 2000);

comment on column public.articles.source_lead is
  'Opening paragraphs of the publisher article, about 100-150 words, quoted with attribution. Not the full text.';
