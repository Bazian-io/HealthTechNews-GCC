"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type BrowseArticle = {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  source_name: string | null;
  source_description: string | null;
  original_url: string;
  country: string | null;
  category: string | null;
  published_at: string | null;
};

function getOptions(values: Array<string | null>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function getArticleMetadata(article: BrowseArticle) {
  const publishedDate = article.published_at
    ? new Date(article.published_at)
    : null;
  const formattedDate =
    publishedDate && !Number.isNaN(publishedDate.getTime())
      ? publishedDate.toLocaleDateString("en", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  return [
    article.source_name,
    article.country,
    article.category,
    formattedDate,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ArticleBrowser({ articles }: { articles: BrowseArticle[] }) {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");

  const countries = useMemo(
    () => getOptions(articles.map((article) => article.country)),
    [articles],
  );
  const categories = useMemo(
    () => getOptions(articles.map((article) => article.category)),
    [articles],
  );

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const hasActiveFilters = Boolean(normalizedSearch || country || category);
  const articlesToBrowse = hasActiveFilters ? articles : articles.slice(4);
  const visibleArticles = articlesToBrowse.filter((article) => {
    const searchableText = [
      article.title,
      article.summary,
      article.source_description,
      article.source_name,
      article.country,
      article.category,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();

    return (
      (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
      (!country || article.country?.trim() === country) &&
      (!category || article.category?.trim() === category)
    );
  });

  function clearFilters() {
    setSearch("");
    setCountry("");
    setCategory("");
  }

  return (
    <section
      id="latest-news"
      className="scroll-mt-6 border-t pt-10 sm:pt-12"
      aria-labelledby="latest-news-heading"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          The news stream
        </p>
        <h2
          id="latest-news-heading"
          className="mt-2 font-editorial text-3xl font-semibold tracking-tight"
        >
          Browse news
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Search all published stories. Country and topic choices appear when
          that information is available.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-xl border border-primary/15 bg-card p-4 shadow-sm md:flex-row md:items-end">
        <label className="min-w-0 flex-1 text-sm font-medium" htmlFor="news-search">
          Search
          <input
            id="news-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search headlines, publishers, or topics"
            className="mt-2 min-h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm font-normal outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </label>

        {countries.length > 0 && (
          <label className="text-sm font-medium md:w-48" htmlFor="country-filter">
            Country
            <select
              id="country-filter"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="mt-2 min-h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">All countries</option>
              {countries.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        {categories.length > 0 && (
          <label className="text-sm font-medium md:w-48" htmlFor="category-filter">
            Topic
            <select
              id="category-filter"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-2 min-h-10 w-full rounded-md border border-input bg-background/70 px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">All topics</option>
              {categories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="min-h-10 w-fit rounded-md border border-primary/20 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-accent"
          >
            Clear
          </button>
        )}
      </div>

      <p
        className="mt-5 text-xs text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        {hasActiveFilters
          ? `${visibleArticles.length} ${visibleArticles.length === 1 ? "result" : "results"}`
          : "Recent stories following today’s top stories"}
      </p>

      {visibleArticles.length > 0 ? (
        <div className="mt-3 divide-y border-y border-primary/15">
          {visibleArticles.map((article) => {
            const metadata = getArticleMetadata(article);

            return (
              <article
                key={article.id}
                className="grid gap-3 px-3 py-5 transition-colors hover:bg-accent/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8"
              >
                <div className="space-y-2">
                  {metadata && (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {metadata}
                    </p>
                  )}
                  <h3>
                    {article.slug?.trim() ? (
                      <Link
                        href={`/news/${article.slug}`}
                        className="break-words font-editorial text-xl font-semibold leading-snug underline-offset-4 transition-colors hover:text-primary hover:underline"
                      >
                        {article.title}
                      </Link>
                    ) : (
                      <span className="break-words font-editorial text-xl font-semibold leading-snug">
                        {article.title}
                      </span>
                    )}
                  </h3>
                </div>
                <a
                  href={article.original_url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Original source ↗
                </a>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 border-y py-6 text-sm text-muted-foreground">
          {hasActiveFilters
            ? "No published articles match these filters."
            : "More news will appear here as it is published."}
        </p>
      )}
    </section>
  );
}
